import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { buildInvoiceData, renderInvoiceHtml } from '../utils/invoice.js';
import { toCamelCase } from '../utils/camel-case.js';

const router = express.Router({ mergeParams: true });

router.use(authenticateToken);

// POST /api/invoices/customers/:customerId/projects/:projectId/preview
router.post(
  '/customers/:customerId/projects/:projectId/preview',
  async (req, res) => {
    try {
      const { customerId, projectId } = req.params;
      const data = await buildInvoiceData({
        userId: req.user.id,
        customerId,
        projectId
      });
      const invoiceNo = data.project?.invoice_number || '';
      // Determine invoice date: if missing, set to today and persist once
      let invoiceDate = data.project?.invoice_date || '';
      if (!invoiceDate) {
        const today = new Date();
        // store as ISO date (YYYY-MM-DD) for consistency
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        invoiceDate = `${y}-${m}-${d}`;
        try {
          const db = (await import('../config/database.js')).getDatabase();
          await db.query(
            'UPDATE projects SET invoice_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND customer_id = $3 AND user_id = $4',
            [invoiceDate, projectId, customerId, req.user.id]
          );

          // reflect in memory copy
          if (data.project) {
            data.project.invoice_date = invoiceDate;
          }
        } catch (e) {
          console.error('Failed to persist invoiceDate', e);
        }
      }
      console.log(data);
      const html = renderInvoiceHtml({
        ...toCamelCase(data),
        invoiceNo,
        invoiceDate
      });
      // Structured table data for PDF (no HTML parsing)
      const hasAnyDate =
        Array.isArray(data.tasks) && data.tasks.some((t) => !!t.date);
      const items = (data.tasks || []).map((t) => ({
        date: t.date || null,
        name: t.name,
        hours: t.estimatedHours || 0,
        cost: data.isFixed
          ? null
          : (t.estimatedHours || 0) * (data.project?.hourlyRate || 0)
      }));
      // VAT calculation mirrors utils/invoice.js
      const vatPercentRaw =
        typeof data.user.vat_percent === 'number'
          ? data.user.vat_percent
          : parseFloat(data.user.vat_percent || '0');
      const vatPercent = isNaN(vatPercentRaw) ? 0 : vatPercentRaw;
      const vatAmount = vatPercent > 0 ? data.subtotal * (vatPercent / 100) : 0;
      const total = vatPercent > 0 ? data.subtotal + vatAmount : data.subtotal;
      const table = {
        isFixed: data.isFixed,
        hasAnyDate,
        hourlyRate: data.project?.hourly_rate || 0,
        items,
        subtotal: Number(data.subtotal || 0),
        vatPercent: Number(vatPercent),
        vatAmount: Number(vatAmount),
        total: Number(total)
      };
      // Include plaintext bank details and customer billing/contact for client-side PDF generation only
      const bank = {
        name: data.user?.bank_name || '',
        iban: data.decryptedIban || '',
        bic: data.user?.bank_bic || ''
      };
      const cust = data.customer || {};
      const customer = {
        companyName: cust.name || '',
        firstName: cust.contact_first_name || '',
        lastName: cust.contact_last_name || '',
        street: cust.billing_street || '',
        number: cust.billing_number || '',
        postalCode: cust.billing_postal_code || '',
        city: cust.billing_city || '',
        country: cust.billing_country || '',
        vat: cust.vat_number || ''
      };
      // Prebuilt footer lines to ensure client has stable data immediately after login
      const companyLines = [
        data.user?.company_name || '',
        [data.user?.company_street, data.user?.company_number]
          .filter(Boolean)
          .join(' ')
          .trim(),
        [data.user?.company_postal_code, data.user?.company_city]
          .filter(Boolean)
          .join(' '),
        [data.user?.company_state, data.user?.company_country]
          .filter(Boolean)
          .join(', ')
      ].filter(Boolean);
      const contactLines = [
        data.user?.company_vat_id ? `VAT: ${data.user.company_vat_id}` : null,
        data.user?.company_phone ? `Phone: ${data.user.company_phone}` : null,
        data.user?.email ? `Email: ${data.user.email}` : null
      ].filter(Boolean);
      const bankLines = [
        data.user?.bank_name || null,
        data.decryptedIban ? `IBAN: ${data.decryptedIban}` : null,
        data.user?.bank_bic ? `BIC: ${data.user.bank_bic}` : null
      ].filter(Boolean);
      const footer = { companyLines, contactLines, bankLines };
      res.json({ invoiceNo, html, bank, customer, invoiceDate, table, footer });
    } catch (e) {
      console.error('Invoice preview error', e);
      res.status(500).json({ error: 'Failed to build invoice preview' });
    }
  }
);

export default router;
