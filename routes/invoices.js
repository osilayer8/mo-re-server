import express from 'express'
import { authenticateToken } from '../middleware/auth.js'
import { buildInvoiceData, renderInvoiceHtml } from '../utils/invoice.js'

const router = express.Router({ mergeParams: true })

router.use(authenticateToken)

// POST /api/invoices/customers/:customerId/projects/:projectId/preview
router.post('/customers/:customerId/projects/:projectId/preview', async (req, res) => {
  try {
    const { customerId, projectId } = req.params
    const data = await buildInvoiceData({ userId: req.user.id, customerId, projectId })
    const invoiceNo = data.project?.invoiceNumber || ''
    // Determine invoice date: if missing, set to today and persist once
    let invoiceDate = data.project?.invoiceDate || ''
    if (!invoiceDate) {
      const today = new Date()
      // store as ISO date (YYYY-MM-DD) for consistency
      const y = today.getFullYear()
      const m = String(today.getMonth() + 1).padStart(2, '0')
      const d = String(today.getDate()).padStart(2, '0')
      invoiceDate = `${y}-${m}-${d}`
      try {
        const db = (await import('../config/database.js')).getDatabase()
        await db.run('UPDATE projects SET invoiceDate = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND customerId = ? AND userId = ?', invoiceDate, projectId, customerId, req.user.id)
        // reflect in memory copy
        if (data.project) data.project.invoiceDate = invoiceDate
      } catch (e) {
        console.error('Failed to persist invoiceDate', e)
      }
    }
  const html = renderInvoiceHtml({ ...data, invoiceNo, invoiceDate })
    // Structured table data for PDF (no HTML parsing)
    const hasAnyDate = Array.isArray(data.tasks) && data.tasks.some(t => !!t.date)
    const items = (data.tasks || []).map(t => ({
      date: t.date || null,
      name: t.name,
      hours: t.estimatedHours || 0,
      cost: data.isFixed ? null : ((t.estimatedHours || 0) * (data.project?.hourlyRate || 0))
    }))
    // VAT calculation mirrors utils/invoice.js
    const vatPercentRaw = typeof data.user.vatPercent === 'number' ? data.user.vatPercent : parseFloat(data.user.vatPercent || '0')
    const vatPercent = isNaN(vatPercentRaw) ? 0 : vatPercentRaw
    const vatAmount = vatPercent > 0 ? data.subtotal * (vatPercent / 100) : 0
    const total = vatPercent > 0 ? data.subtotal + vatAmount : data.subtotal
    const table = {
      isFixed: data.isFixed,
      hasAnyDate,
      hourlyRate: data.project?.hourlyRate || 0,
      items,
      subtotal: Number(data.subtotal || 0),
      vatPercent: Number(vatPercent),
      vatAmount: Number(vatAmount),
      total: Number(total)
    }
    // Include plaintext bank details and customer billing/contact for client-side PDF generation only
    const bank = {
      name: data.user?.bankName || '',
      iban: data.decryptedIban || '',
      bic: data.user?.bankBic || ''
    }
    const cust = data.customer || {}
    const customer = {
      companyName: cust.name || '',
      firstName: cust.contactFirstName || '',
      lastName: cust.contactLastName || '',
      street: cust.billingStreet || '',
      number: cust.billingNumber || '',
      postalCode: cust.billingPostalCode || '',
      city: cust.billingCity || '',
      country: cust.billingCountry || '',
      vat: cust.vatNumber || ''
    }
    // Prebuilt footer lines to ensure client has stable data immediately after login
    const companyLines = [
      data.user?.companyName || '',
      [data.user?.companyStreet, data.user?.companyNumber].filter(Boolean).join(' ').trim(),
      [data.user?.companyPostalCode, data.user?.companyCity].filter(Boolean).join(' '),
      [data.user?.companyState, data.user?.companyCountry].filter(Boolean).join(', ')
    ].filter(Boolean)
    const contactLines = [
      data.user?.companyVatId ? `VAT: ${data.user.companyVatId}` : null,
      data.user?.companyPhone ? `Phone: ${data.user.companyPhone}` : null,
      data.user?.email ? `Email: ${data.user.email}` : null
    ].filter(Boolean)
    const bankLines = [
      data.user?.bankName || null,
      data.decryptedIban ? `IBAN: ${data.decryptedIban}` : null,
      data.user?.bankBic ? `BIC: ${data.user.bankBic}` : null
    ].filter(Boolean)
    const footer = { companyLines, contactLines, bankLines }
  res.json({ invoiceNo, html, bank, customer, invoiceDate, table, footer })
  } catch (e) {
    console.error('Invoice preview error', e)
    res.status(500).json({ error: 'Failed to build invoice preview' })
  }
})

export default router
