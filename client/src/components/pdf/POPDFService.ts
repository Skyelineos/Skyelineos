import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface POData {
  poId: string;
  projectName: string;
  projectAddress?: string;
  projectStartDate?: string;
  subcontractor: {
    name?: string;
    company?: string;
    contact?: string;
    email?: string;
    phone?: string;
    trade?: string;
  };
  description: string;
  amount: number;
  durationDays?: number;
  attachments?: string[];
  createdAt?: string;
  projectId: string;
}

export class POPDFService {
  static generatePDF(data: POData): jsPDF {
    const doc = new jsPDF();
    const brandGold = [201, 169, 110] as [number, number, number];
    const darkGray = [30, 30, 30] as [number, number, number];

    // Header
    doc.setFillColor(...brandGold);
    doc.rect(0, 0, 210, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('PURCHASE ORDER', 14, 14);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`PO #${data.poId}`, 196, 14, { align: 'right' });

    // Project info
    doc.setTextColor(...darkGray);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('PROJECT', 14, 32);
    doc.setFont('helvetica', 'normal');
    doc.text(data.projectName, 14, 38);
    if (data.projectAddress) doc.text(data.projectAddress, 14, 44);

    // Subcontractor info
    doc.setFont('helvetica', 'bold');
    doc.text('SUBCONTRACTOR', 110, 32);
    doc.setFont('helvetica', 'normal');
    doc.text(data.subcontractor.company || data.subcontractor.name || data.subcontractor.contact || '', 110, 38);
    if (data.subcontractor.email) doc.text(data.subcontractor.email, 110, 44);
    if (data.subcontractor.phone) doc.text(data.subcontractor.phone, 110, 50);

    // Line items table
    autoTable(doc, {
      startY: 62,
      head: [['Description', 'Duration', 'Amount']],
      body: [
        [
          data.description,
          data.durationDays ? `${data.durationDays} days` : '—',
          `$${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
        ]
      ],
      headStyles: { fillColor: brandGold, textColor: [255, 255, 255] },
      styles: { fontSize: 10 },
      columnStyles: { 2: { halign: 'right' } },
    });

    const finalY = (doc as any).lastAutoTable?.finalY ?? 80;

    // Total
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL:', 150, finalY + 12);
    doc.text(`$${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 196, finalY + 12, { align: 'right' });

    // Footer
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('Skyeline Homes  |  American Fork, UT  |  skyeline.homes', 105, 285, { align: 'center' });
    if (data.createdAt) {
      doc.text(`Issued: ${new Date(data.createdAt).toLocaleDateString()}`, 14, 285);
    }

    return doc;
  }

  static async downloadPDF(data: POData): Promise<void> {
    const doc = this.generatePDF(data);
    doc.save(`PO-${data.poId}-${data.projectName.replace(/\s+/g, '-')}.pdf`);
  }

  static async generatePDFPreview(data: POData): Promise<string> {
    const doc = this.generatePDF(data);
    const blob = doc.output('blob');
    return URL.createObjectURL(blob);
  }
}
