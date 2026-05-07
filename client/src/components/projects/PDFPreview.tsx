import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { EstimatePDFGenerator, convertEstimateDataForPDF } from './PDFGenerator';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Eye, Download } from 'lucide-react';

interface PDFPreviewProps {
  estimate: any;
  projectId: string;
  onClose?: () => void;
}

export function PDFPreview({ estimate, projectId, onClose }: PDFPreviewProps) {
  // Fetch project data
  const { data: project } = useQuery({
    queryKey: ['/api/projects', projectId],
    enabled: !!projectId
  });

  const pdfData = convertEstimateDataForPDF(
    estimate, 
    (project as any)?.name || 'Unknown Project',
    (project as any)?.clientName || 'Unknown Client'
  );

  const generatePDF = () => {
    const pdfGenerator = new EstimatePDFGenerator();
    pdfGenerator.generatePDF(pdfData);
    if (onClose) onClose();
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
        
        <div className="bg-white p-8 border rounded-lg shadow-sm">
          {/* Header */}
          <div className="border-b pb-6 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-theme-primary mb-2">SKYELINE HOMES</h1>
                <p className="text-gray-600">Custom Homebuilding Powered by Precision</p>
              </div>
              <div className="text-right">
                <div className="bg-gray-100 px-4 py-2 rounded">
                  <h2 className="text-xl font-bold text-gray-800">PROJECT ESTIMATE</h2>
                </div>
              </div>
            </div>
            
            <div className="mt-6 grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-600">PROJECT</p>
                <p className="text-lg">{pdfData.projectName}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-600">CLIENT</p>
                <p className="text-lg">{pdfData.clientName}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-600">DATE</p>
                <p className="text-lg">{new Date(pdfData.estimateDate).toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          {/* Categories */}
          <div className="space-y-6">
            {pdfData.categories.map((category, index) => {
              const categoryTotal = category.items.reduce((sum, item) => sum + item.cost, 0);
              
              return (
                <div key={index} className="border rounded-lg overflow-hidden">
                  <div className="bg-blue-600 text-white px-4 py-3">
                    <h3 className="font-bold text-lg">{category.name.toUpperCase()}</h3>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-100 border-b">
                          <th className="text-left p-2 font-semibold text-sm">Trade</th>
                          <th className="text-left p-2 font-semibold text-sm">Vendor</th>
                          <th className="text-left p-2 font-semibold text-sm">Description</th>
                          <th className="text-center p-2 font-semibold text-sm">Bid Status</th>
                          <th className="text-center p-2 font-semibold text-sm">Approval</th>
                          <th className="text-center p-2 font-semibold text-sm">Duration</th>
                          <th className="text-right p-2 font-semibold text-sm">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {category.items.map((item, itemIndex) => (
                          <tr key={itemIndex} className="border-b hover:bg-gray-50">
                            <td className="p-2 text-sm">{item.trade}</td>
                            <td className="p-2 text-sm">{item.vendor}</td>
                            <td className="p-2 text-sm">{item.description}</td>
                            <td className="p-2 text-center">
                              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                item.status === 'Sub Selected' ? 'bg-green-200 text-green-800' :
                                item.status === 'Bidding' ? 'bg-yellow-200 text-yellow-800' :
                                'bg-gray-200 text-gray-800'
                              }`}>
                                {item.status || 'Estimating'}
                              </span>
                            </td>
                            <td className="p-2 text-center">
                              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                item.approvalStatus === 'Approved' ? 'bg-green-200 text-green-800' :
                                item.approvalStatus === 'Rejected' ? 'bg-red-100 text-red-700' :
                                'bg-slate-200 text-slate-800'
                              }`}>
                                {item.approvalStatus || 'Pending'}
                              </span>
                            </td>
                            <td className="p-2 text-center text-sm">{item.duration} days</td>
                            <td className="p-2 text-right font-medium text-sm">{formatCurrency(item.cost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="bg-gray-50 px-4 py-3 border-t">
                    <div className="text-right">
                      <span className="font-bold text-lg">
                        {category.name} Subtotal: {formatCurrency(categoryTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total */}
          <div className="mt-8 border-t pt-6">
            <div className="bg-green-600 text-white p-4 rounded-lg">
              <div className="text-center">
                <h3 className="text-2xl font-bold">
                  TOTAL ESTIMATE: {formatCurrency(pdfData.totalCost)}
                </h3>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-gray-500 italic">
            <p>Skyeline Homes – Custom Homebuilding Powered by Precision</p>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button onClick={generatePDF}>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>
    </div>
  );
}