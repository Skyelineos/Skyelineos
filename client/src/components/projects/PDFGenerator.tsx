import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Extend jsPDF type to include autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

interface PDFEstimateItem {
  trade: string;
  vendor: string;
  description: string;
  duration: number;
  cost: number;
  status?: string;
  approvalStatus?: string;
}

interface PDFEstimateCategory {
  name: string;
  items: PDFEstimateItem[];
}

interface PDFEstimateData {
  projectName: string;
  clientName: string;
  estimateDate: string;
  categories: PDFEstimateCategory[];
  totalCost: number;
}

export class EstimatePDFGenerator {
  private doc: jsPDF;
  
  constructor() {
    this.doc = new jsPDF();
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  private addHeader(data: PDFEstimateData): void {
    const pageWidth = this.doc.internal.pageSize.width;
    
    // Company logo placeholder (you can replace this with actual logo later)
    this.doc.setFontSize(24);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('SKYELINE HOMES', 20, 30);
    
    this.doc.setFontSize(12);
    this.doc.setFont('helvetica', 'normal');
    this.doc.text('Custom Homebuilding Powered by Precision', 20, 40);
    
    // Estimate title
    this.doc.setFontSize(20);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('PROJECT ESTIMATE', pageWidth / 2, 60, { align: 'center' });
    
    // Project and client info
    this.doc.setFontSize(12);
    this.doc.setFont('helvetica', 'normal');
    
    const infoStartY = 80;
    this.doc.text(`Project: ${data.projectName}`, 20, infoStartY);
    this.doc.text(`Client: ${data.clientName}`, 20, infoStartY + 10);
    this.doc.text(`Date: ${new Date(data.estimateDate).toLocaleDateString()}`, 20, infoStartY + 20);
    
    // Add a line separator
    this.doc.setLineWidth(0.5);
    this.doc.line(20, infoStartY + 35, pageWidth - 20, infoStartY + 35);
  }

  private addCategorySection(category: PDFEstimateCategory, startY: number): number {
    const pageWidth = this.doc.internal.pageSize.width;
    let currentY = startY;
    
    // Category header
    this.doc.setFontSize(14);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFillColor(59, 130, 246); // Blue background
    this.doc.rect(20, currentY, pageWidth - 40, 8, 'F');
    
    this.doc.setTextColor(255, 255, 255); // White text
    this.doc.text(category.name.toUpperCase(), 25, currentY + 6);
    
    currentY += 15;
    this.doc.setTextColor(0, 0, 0); // Reset to black text
    
    // Create table data for this category
    const tableData = category.items.map(item => [
      item.trade,
      item.vendor,
      item.description,
      item.status || 'Estimating',
      item.approvalStatus || 'Pending',
      `${item.duration} days`,
      this.formatCurrency(item.cost)
    ]);
    
    // Add table
    this.doc.autoTable({
      startY: currentY,
      head: [['Trade', 'Vendor', 'Description', 'Bid Status', 'Approval', 'Duration', 'Cost']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [229, 231, 235], // Light gray
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: 9
      },
      bodyStyles: {
        fontSize: 8,
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 25 }, // Trade
        1: { cellWidth: 25 }, // Vendor
        2: { cellWidth: 40 }, // Description
        3: { cellWidth: 20 }, // Bid Status
        4: { cellWidth: 20 }, // Approval Status
        5: { cellWidth: 18 }, // Duration
        6: { cellWidth: 22, halign: 'right' } // Cost
      },
      margin: { left: 20, right: 20 },
      tableWidth: 'wrap'
    });
    
    // Calculate category subtotal
    const categoryTotal = category.items.reduce((sum, item) => sum + item.cost, 0);
    
    // Add subtotal row
    const finalY = (this.doc as any).lastAutoTable.finalY;
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(`${category.name} Subtotal: ${this.formatCurrency(categoryTotal)}`, 
                  pageWidth - 20, finalY + 10, { align: 'right' });
    
    return finalY + 25; // Return position for next section
  }

  private addFooter(data: PDFEstimateData, startY: number): void {
    const pageWidth = this.doc.internal.pageSize.width;
    const pageHeight = this.doc.internal.pageSize.height;
    
    // Total section
    this.doc.setFontSize(16);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFillColor(34, 197, 94); // Green background
    this.doc.rect(20, startY, pageWidth - 40, 12, 'F');
    
    this.doc.setTextColor(255, 255, 255); // White text
    this.doc.text(`TOTAL ESTIMATE: ${this.formatCurrency(data.totalCost)}`, 
                  pageWidth / 2, startY + 8, { align: 'center' });
    
    // Footer text
    this.doc.setTextColor(0, 0, 0);
    this.doc.setFontSize(10);
    this.doc.setFont('helvetica', 'italic');
    this.doc.text('Skyeline Homes – Custom Homebuilding Powered by Precision', 
                  pageWidth / 2, pageHeight - 20, { align: 'center' });
    
    // Add page border
    this.doc.setLineWidth(1);
    this.doc.rect(15, 15, pageWidth - 30, pageHeight - 30);
  }

  public generatePDF(data: PDFEstimateData): void {
    // Add header
    this.addHeader(data);
    
    let currentY = 130;
    
    // Add each category
    data.categories.forEach(category => {
      // Check if we need a new page
      if (currentY > 200) {
        this.doc.addPage();
        currentY = 30;
      }
      
      currentY = this.addCategorySection(category, currentY);
    });
    
    // Add footer
    this.addFooter(data, currentY + 10);
    
    // Generate filename
    const filename = `${data.projectName.replace(/\s+/g, '_')}_Estimate_${new Date().toISOString().split('T')[0]}.pdf`;
    
    // Save the PDF
    this.doc.save(filename);
  }
}

// Helper function to convert estimate data to PDF format
export const convertEstimateDataForPDF = (estimate: any, projectName: string, clientName: string): PDFEstimateData => {
  const categories = estimate.categories?.map((cat: any) => ({
    name: cat.name || cat.categoryName || 'Unknown Category',
    items: cat.items?.map((item: any) => ({
      trade: item.trade || 'Unknown Trade',
      vendor: item.vendor || 'Unknown Vendor',
      description: item.description || 'No description provided',
      duration: item.duration || 0,
      cost: parseFloat(item.estimatedCost?.toString() || '0') || 0,
      status: item.status || 'Estimating',
      approvalStatus: item.approvalStatus || 'Pending'
    })) || []
  })) || [];

  const totalCost = categories.reduce((total: number, cat: any) => 
    total + cat.items.reduce((catTotal: number, item: any) => catTotal + item.cost, 0), 0
  );

  return {
    projectName: projectName || 'Unknown Project',
    clientName: clientName || 'Unknown Client',
    estimateDate: new Date().toISOString().split('T')[0],
    categories,
    totalCost
  };
};