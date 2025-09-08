import { decryptValue } from './encryption.js';
import { getDatabase } from '../config/database.js';
import { toCamelCase } from './camel-case.js';

function formatDDMMYYYY(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (isNaN(d)) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

export async function buildInvoiceData({ userId, customerId, projectId }) {
  const db = getDatabase();
  const user = (await db.query('SELECT * FROM users WHERE id = $1', [userId]))
    .rows[0];

  if (!user) throw new Error('User not found');
  const customer = (
    await db.query('SELECT * FROM customers WHERE id = $1 AND user_id = $2', [
      customerId,
      userId
    ])
  ).rows[0];

  if (!customer) throw new Error('Customer not found');
  const project = (
    await db.query(
      'SELECT * FROM projects WHERE id = $1 AND customer_id = $2 AND user_id = $3',
      [projectId, customerId, userId]
    )
  ).rows[0];

  if (!project) throw new Error('Project not found');
  const tasks = (
    await db.query(
      'SELECT * FROM tasks WHERE project_id = $1 AND user_id = $2 ORDER BY order_num ASC, id ASC',
      [projectId, userId]
    )
  ).rows;

  let decryptedIban = '';
  if (toCamelCase(user).bankIbanCipher) {
    try {
      decryptedIban = decryptValue({
        cipher: toCamelCase(user).bankIbanCipher,
        iv: toCamelCase(user).bankIbanIv,
        tag: toCamelCase(user).bankIbanTag
      });
    } catch {}
  }

  const isFixed = toCamelCase(project).pricingType === 'FIXED';
  const subtotal = isFixed
    ? toCamelCase(project).fixedPrice
    : toCamelCase(tasks).reduce(
        (s, t) => s + t.estimatedHours * toCamelCase(project).hourlyRate,
        0
      );

  return { user, customer, project, tasks, decryptedIban, isFixed, subtotal };
}

export function renderInvoiceHtml({
  user,
  customer,
  project,
  tasks,
  decryptedIban,
  isFixed,
  subtotal,
  invoiceNo,
  invoiceDate
}) {
  const loc = user?.locale === 'de' ? 'de' : 'en';
  const t = {
    en: {
      invoice: 'Invoice',
      date: 'Date',
      task: 'Task',
      hours: 'Hours',
      cost: 'Cost',
      subtotal: 'Subtotal',
      vat: (p) => `VAT (${p}%)`,
      total: 'Total',
      noTasks: 'No tasks',
      vatId: 'VAT',
      phone: 'Phone',
      email: 'Email'
    },
    de: {
      invoice: 'Rechnung',
      date: 'Datum',
      task: 'Aufgabe',
      hours: 'Stunden',
      cost: 'Kosten',
      subtotal: 'Zwischensumme',
      vat: (p) => `MwSt. (${p}%)`,
      total: 'Gesamt',
      noTasks: 'Keine Aufgaben',
      vatId: 'USt-IdNr.',
      phone: 'Telefon',
      email: 'E-Mail'
    }
  }[loc];
  const customerAddr = [
    customer.name,
    customer.billingStreet &&
      `${customer.billingStreet} ${customer.billingNumber || ''}`.trim(),
    [customer.billingPostalCode, customer.billingCity].filter(Boolean).join(' ')
  ]
    .filter(Boolean)
    .join('<br>');

  const hasAnyDate = Array.isArray(tasks) && tasks.some((t) => !!t.date);
  const columnsCount = isFixed
    ? hasAnyDate
      ? 3
      : 2 // [Date?], Task, Hours
    : hasAnyDate
    ? 4
    : 3; // [Date?], Task, Hours, Cost

  // VAT calculation from user settings
  const vatPercentRaw =
    typeof user.vatPercent === 'number'
      ? user.vatPercent
      : parseFloat(user.vatPercent || '0');
  const vatPercent = isNaN(vatPercentRaw) ? 0 : vatPercentRaw;
  const vatAmount = vatPercent > 0 ? Number(subtotal) * (vatPercent / 100) : 0;
  const grandTotal = vatPercent > 0 ? Number(subtotal) + vatAmount : subtotal;
  const vatPercentLabel = Number.isFinite(vatPercent)
    ? String(vatPercent)
    : '0';

  const rows = tasks
    .map((tRow) => {
      const dateStr = tRow.date ? formatDDMMYYYY(tRow.date) : '';
      const cells = [];
      if (hasAnyDate) {
        cells.push(`<td style=\"padding:4px 8px;\">${dateStr}</td>`); // Date first when present
      }
      cells.push(`<td style=\"padding:4px 8px;\">${tRow.name}</td>`); // Task
      cells.push(
        `<td style=\"padding:4px 8px;text-align:center;\">${
          tRow.estimatedHours ?? ''
        }</td>`
      ); // Hours
      if (!isFixed) {
        const cost = (tRow.estimatedHours ?? 0) * (project.hourlyRate ?? 0);
        cells.push(
          `<td style=\"padding:4px 8px;text-align:right;\">€${cost.toFixed(
            2
          )}</td>`
        ); // Cost
      }
      return `<tr>\n    ${cells.join('\n    ')}\n  </tr>`;
    })
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${invoiceNo}</title></head><body style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.4;">
  <table width="100%;">
    <tr>
      <td valign="top" style="width:50%">
        ${customerAddr}
      </td>
    </tr>
  </table>
  <h3 style="margin:2rem 0 4px;">${t.invoice} ${invoiceNo}</h3>
  <small>${t.date}: ${formatDDMMYYYY(invoiceDate || new Date())}</small>
  <p style="margin:24px 0 8px;font-weight:bold">${project.name}</p>
  ${
    project.description
      ? `<p style="margin:0 0 12px;">${project.description}</p>`
      : ''
  }
  <table width=\"100%\" style=\"border-collapse:collapse;border:1px solid #ccc;\">
    <thead>
      <tr style=\"background:#f5f5f5;\">
  ${
    hasAnyDate
      ? '<th style="padding:6px 8px;text-align:left;">' + t.date + '</th>'
      : ''
  }
  <th style=\"padding:6px 8px;text-align:left;\">${t.task}</th>
  <th style=\"padding:6px 8px;text-align:center;\">${t.hours}</th>
  ${
    isFixed
      ? ''
      : '<th style="padding:6px 8px;text-align:right;">' + t.cost + '</th>'
  }
      </tr>
    </thead>
    <tbody>
  ${
    rows ||
    `<tr><td colspan=\"${columnsCount}\" style=\"padding:8px;text-align:center;\">${t.noTasks}</td></tr>`
  }
  <tr><td colspan=\"${
    columnsCount - 1
  }\" style=\"padding:6px 8px;text-align:right;font-weight:bold;\">${
    t.subtotal
  }</td><td style=\"padding:6px 8px;text-align:right;\">€${subtotal}</td></tr>
  <tr><td colspan=\"${
    columnsCount - 1
  }\" style=\"padding:6px 8px;text-align:right;font-weight:bold;\">${t.vat(
    vatPercentLabel
  )}</td><td style=\"padding:6px 8px;text-align:right;\">${
    vatPercent > 0 ? `€${vatAmount.toFixed(2)}` : '-'
  }</td></tr>
  <tr><td colspan=\"${
    columnsCount - 1
  }\" style=\"padding:6px 8px;text-align:right;font-weight:bold;\">${
    t.total
  }</td><td style=\"padding:6px 8px;text-align:right;font-weight:bold;\">€${grandTotal}</td></tr>
    </tbody>
  </table>
  ${
    user.invoiceNotes
      ? `<pre style="margin-top:18px;padding:12px;background:#f9f9f9;border:1px solid #eee;white-space:pre-wrap;">${user.invoiceNotes}</pre>`
      : ''
  }
  
  <!-- Footer: Company, Contact, Bank -->
  <table width="100%" style="margin-top:18px;color:#666;font-size:12px;">
    <tr>
      <td valign="top" style="width:33.3%;padding-right:12px;">
        ${[
          user.companyName,
          [user.companyStreet, user.companyNumber]
            .filter(Boolean)
            .join(' ')
            .trim(),
          [user.companyPostalCode, user.companyCity].filter(Boolean).join(' '),
          [user.companyState, user.companyCountry].filter(Boolean).join(', ')
        ]
          .filter(Boolean)
          .map((l) => `<div style=\"margin:2px 0\">${l}</div>`)
          .join('')}
      </td>
      <td valign="top" style="width:33.3%;padding:0 12px;">
        ${[
          user.companyVatId ? `${t.vatId}: ${user.companyVatId}` : '',
          user.companyPhone ? `${t.phone}: ${user.companyPhone}` : '',
          user.email ? `${t.email}: ${user.email}` : ''
        ]
          .filter(Boolean)
          .map((l) => `<div style=\"margin:2px 0\">${l}</div>`)
          .join('')}
      </td>
      <td valign="top" style="width:33.3%;padding-left:12px;">
        ${[
          user.bankName || '',
          decryptedIban ? `IBAN: ${decryptedIban}` : '',
          user.bankBic ? `BIC: ${user.bankBic}` : ''
        ]
          .filter(Boolean)
          .map((l) => `<div style=\"margin:2px 0\">${l}</div>`)
          .join('')}
      </td>
    </tr>
  </table>
  </body></html>`;
}
