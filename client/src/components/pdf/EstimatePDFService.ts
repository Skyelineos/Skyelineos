import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Extend jsPDF type to include autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

export interface EstimatePDFData {
  id?: number;
  projectName: string;
  clientName: string;
  title?: string;
  description?: string;
  estimateDate?: string;
  status?: string;
  totalCost?: number;
  logoUrl?: string;
  categories?: Array<{
    name: string;
    items: Array<{
      trade: string;
      vendor?: string;
      description: string;
      duration?: number;
      cost: number;
      estimatedCost?: number;
      markup?: number;
      contingency?: number;
    }>;
  }>;
  items?: Array<{
    trade: string;
    vendor?: string;
    description: string;
    duration?: number;
    cost: number;
    estimatedCost?: number;
    markup?: number;
    contingency?: number;
  }>;
}

export class EstimatePDFService {
  private static formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  }

  private static calculateItemTotal(item: any): number {
    const baseCost = item.estimatedCost || item.cost || 0;
    const markup = item.markup || 0;
    const contingency = item.contingency || 0;
    
    // Calculate with markup and contingency percentages
    const withMarkup = baseCost * (1 + markup / 100);
    const total = withMarkup * (1 + contingency / 100);
    
    return total;
  }

  private static addHeader(doc: jsPDF, data: EstimatePDFData): void {
    const pageWidth = doc.internal.pageSize.width;
    
    // Company header
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('SKYELINE HOMES', 20, 30);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Custom Homebuilding Powered by Precision', 20, 40);
    
    // Estimate title
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('PROJECT ESTIMATE', pageWidth / 2, 60, { align: 'center' });
    
    // Project and client info
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    
    const infoStartY = 80;
    doc.text(`Project: ${data.projectName}`, 20, infoStartY);
    doc.text(`Client: ${data.clientName}`, 20, infoStartY + 10);
    doc.text(`Date: ${data.estimateDate ? new Date(data.estimateDate).toLocaleDateString() : new Date().toLocaleDateString()}`, 20, infoStartY + 20);
    
    if (data.title) {
      doc.text(`Estimate: ${data.title}`, 20, infoStartY + 30);
    }
  }

  private static addItemsTable(doc: jsPDF, data: EstimatePDFData, startY: number): number {
    const items = data.items || [];
    
    if (items.length === 0) {
      doc.setFontSize(12);
      doc.text('No items in this estimate.', 20, startY);
      return startY + 20;
    }

    const tableData = items.map(item => [
      item.trade || 'N/A',
      item.vendor || 'TBD',
      item.description || '',
      item.duration ? `${item.duration} days` : 'TBD',
      this.formatCurrency(this.calculateItemTotal(item))
    ]);

    doc.autoTable({
      startY: startY,
      head: [['Trade', 'Vendor', 'Description', 'Duration', 'Cost']],
      body: tableData,
      headStyles: { fillColor: [65, 117, 5] },
      styles: { fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 30 },
        2: { cellWidth: 80 },
        3: { cellWidth: 25 },
        4: { cellWidth: 30, halign: 'right' }
      }
    });

    return (doc as any).lastAutoTable.finalY + 20;
  }

  private static addCategoriesTable(doc: jsPDF, data: EstimatePDFData, startY: number): number {
    const categories = data.categories || [];
    let currentY = startY;

    if (categories.length === 0) {
      return this.addItemsTable(doc, data, currentY);
    }

    categories.forEach(category => {
      // Category header
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(category.name, 20, currentY);
      currentY += 15;

      if (category.items && category.items.length > 0) {
        const tableData = category.items.map(item => [
          item.trade || 'N/A',
          item.vendor || 'TBD',
          item.description || '',
          item.duration ? `${item.duration} days` : 'TBD',
          this.formatCurrency(this.calculateItemTotal(item))
        ]);

        doc.autoTable({
          startY: currentY,
          head: [['Trade', 'Vendor', 'Description', 'Duration', 'Cost']],
          body: tableData,
          headStyles: { fillColor: [65, 117, 5] },
          styles: { fontSize: 9 },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 30 },
            2: { cellWidth: 80 },
            3: { cellWidth: 25 },
            4: { cellWidth: 30, halign: 'right' }
          }
        });

        currentY = (doc as any).lastAutoTable.finalY + 15;
      } else {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('No items in this category.', 25, currentY);
        currentY += 20;
      }
    });

    return currentY;
  }

  private static addSummary(doc: jsPDF, data: EstimatePDFData, startY: number): void {
    const totalCost = data.totalCost || 0;

    doc.setDrawColor(0, 0, 0);
    doc.line(20, startY, 190, startY);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL ESTIMATE:', 120, startY + 15);
    doc.text(this.formatCurrency(totalCost), 170, startY + 15);

    // Footer
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('This estimate is valid for 30 days from the date above.', 20, startY + 35);
    doc.text('All work subject to standard terms and conditions.', 20, startY + 45);
  }

  static async generatePDF(data: EstimatePDFData): Promise<jsPDF> {
    const doc = new jsPDF();

    // Add header
    this.addHeader(doc, data);

    // Add items/categories table
    let currentY = 120;
    if (data.categories && data.categories.length > 0) {
      currentY = this.addCategoriesTable(doc, data, currentY);
    } else {
      currentY = this.addItemsTable(doc, data, currentY);
    }

    // Add summary
    this.addSummary(doc, data, currentY + 10);

    return doc;
  }

  static async downloadPDF(data: EstimatePDFData): Promise<void> {
    try {
      const doc = await this.generatePDF(data);
      const filename = `estimate-${data.projectName?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'project'}-${Date.now()}.pdf`;
      doc.save(filename);
    } catch (error) {
      console.error('Error generating PDF:', error);
      throw new Error('Failed to generate PDF');
    }
  }

  static async getPDFBlob(data: EstimatePDFData): Promise<Blob> {
    try {
      const doc = await this.generatePDF(data);
      return doc.output('blob');
    } catch (error) {
      console.error('Error generating PDF blob:', error);
      throw new Error('Failed to generate PDF blob');
    }
  }
}