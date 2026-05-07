import jsPDF from 'jspdf';
import type { GanttExportOptions } from '@/types/gantt';

/**
 * Export Plotly figure to PNG
 */
export async function exportToPNG(
  plotlyDiv: HTMLElement,
  options: GanttExportOptions & { projectName?: string }
): Promise<void> {
  const { scale = 2, includeTitle = true, projectName = 'Project Schedule' } = options;
  
  try {
    // Use Plotly's built-in PNG export
    const plotly = await import('plotly.js');
    
    await plotly.downloadImage(plotlyDiv, {
      format: 'png',
      width: plotlyDiv.offsetWidth * scale,
      height: plotlyDiv.offsetHeight * scale,
      filename: `${sanitizeFilename(projectName)}_gantt_${getDateStamp()}`
    });
    
    console.log('✅ PNG export completed successfully');
  } catch (error) {
    console.error('❌ PNG export failed:', error);
    throw new Error('Failed to export PNG');
  }
}

/**
 * Export Plotly figure to PDF
 */
export async function exportToPDF(
  plotlyDiv: HTMLElement,
  options: GanttExportOptions & { projectName?: string }
): Promise<void> {
  const { scale = 2, includeTitle = true, includeLegend = true, projectName = 'Project Schedule' } = options;
  
  try {
    const plotly = await import('plotly.js');
    
    // Get chart as image data URL
    const imageData = await plotly.toImage(plotlyDiv, {
      format: 'png',
      width: plotlyDiv.offsetWidth * scale,
      height: plotlyDiv.offsetHeight * scale
    });
    
    // Create PDF with landscape A4 orientation
    const pdf = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    // Add title if requested
    if (includeTitle && projectName) {
      pdf.setFontSize(16);
      pdf.text(projectName, pageWidth / 2, 20, { align: 'center' });
      pdf.setFontSize(12);
      pdf.text(`Generated on ${new Date().toLocaleDateString()}`, pageWidth / 2, 30, { align: 'center' });
    }
    
    // Calculate image dimensions to fit page
    const imgWidth = pageWidth - 20; // 10mm margin on each side
    const imgHeight = (plotlyDiv.offsetHeight / plotlyDiv.offsetWidth) * imgWidth;
    
    // Position image (account for title)
    const yPosition = includeTitle ? 40 : 20;
    
    // Add image to PDF
    pdf.addImage(imageData, 'PNG', 10, yPosition, imgWidth, Math.min(imgHeight, pageHeight - yPosition - 10));
    
    // Add legend note if included
    if (includeLegend) {
      const legendY = Math.min(yPosition + imgHeight + 10, pageHeight - 20);
      pdf.setFontSize(8);
      pdf.text('Legend: Green = On Track, Yellow = Pending Approval, Red = Delayed', 10, legendY);
    }
    
    // Save PDF
    pdf.save(`${sanitizeFilename(projectName)}_gantt_${getDateStamp()}.pdf`);
    
    console.log('✅ PDF export completed successfully');
  } catch (error) {
    console.error('❌ PDF export failed:', error);
    throw new Error('Failed to export PDF');
  }
}

/**
 * Export trades data as JSON
 */
export function exportToJSON(trades: any[], projectName: string = 'Project'): void {
  try {
    const exportData = {
      project: projectName,
      exportDate: new Date().toISOString(),
      version: '1.0',
      trades: trades.map(trade => ({
        ...trade,
        // Ensure dates are in ISO format
        startDate: trade.startDate,
        endDate: trade.endDate
      }))
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `${sanitizeFilename(projectName)}_schedule_${getDateStamp()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    console.log('✅ JSON export completed successfully');
  } catch (error) {
    console.error('❌ JSON export failed:', error);
    throw new Error('Failed to export JSON');
  }
}

/**
 * Import trades from JSON file
 */
export function importFromJSON(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);
        
        if (!data.trades || !Array.isArray(data.trades)) {
          throw new Error('Invalid file format: missing trades array');
        }
        
        // Validate required fields
        const requiredFields = ['id', 'name', 'phase', 'startDate', 'endDate', 'status'];
        const invalidTrades = data.trades.filter((trade: any) => 
          requiredFields.some(field => !trade[field])
        );
        
        if (invalidTrades.length > 0) {
          throw new Error(`Invalid trade data: missing required fields in ${invalidTrades.length} trades`);
        }
        
        console.log('✅ JSON import completed successfully');
        resolve(data.trades);
      } catch (error) {
        console.error('❌ JSON import failed:', error);
        reject(new Error('Failed to parse JSON file'));
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Utility functions
 */
function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

function getDateStamp(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get export capabilities based on browser support
 */
export function getExportCapabilities() {
  return {
    png: true,
    pdf: typeof jsPDF !== 'undefined',
    json: true
  };
}