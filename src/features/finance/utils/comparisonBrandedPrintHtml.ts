import { buildReportTableHtml, validateReportTable, type ReportTable } from './reportTableExport';

/** Shared Tomorrow Finance branded export for Comparison dashboard and statement.
 * Delegates escaping, table validation and numeric formatting to the existing verified renderer. */
export function buildComparisonBrandedPrintHtml(table: ReportTable): string {
  validateReportTable(table);
  const html = buildReportTableHtml(table);
  return html.replace('</style>', `
    .masthead{background:#0B315C;color:white;padding:14px 18px;border-radius:9px;border-bottom:0}
    .brand{color:white}.doc-type{color:#BFDBFE}
    .report-title{color:#0B315C;border-left:5px solid #15803D;padding-left:12px}
    .meta{background:#EDF4FA;border:1px solid #DCE5EF;border-radius:8px}
    th{background:#0B315C}tbody tr:nth-child(even){background:#F1F6FB}
    .footer{color:#0B315C}
  </style>`);
}
