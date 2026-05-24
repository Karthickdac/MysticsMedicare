import { useGetBill, usePayBill } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { getGetBillQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Hospital, Printer, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function BillDetail() {
  const { id } = useParams<{ id: string }>();
  const billId = Number(id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: bill, isLoading } = useGetBill(billId, {
    query: { enabled: !!billId, queryKey: getGetBillQueryKey(billId) }
  });

  const payMutation = usePayBill();

  const handlePrint = () => {
    window.print();
  };

  const handleMarkPaid = () => {
    payMutation.mutate(
      { id: billId },
      {
        onSuccess: () => {
          toast({ title: "Payment recorded" });
          queryClient.invalidateQueries({ queryKey: getGetBillQueryKey(billId) });
        }
      }
    );
  };

  if (isLoading) return <div className="p-6"><Skeleton className="h-[600px] w-full max-w-3xl mx-auto" /></div>;
  if (!bill) return <div className="p-6">Bill not found</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex justify-end gap-3 print:hidden">
        {bill.status === "unpaid" && (
          <Button onClick={handleMarkPaid} disabled={payMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <CheckCircle className="w-4 h-4 mr-2" /> Mark as Paid
          </Button>
        )}
        <Button variant="outline" onClick={handlePrint}>
          <Printer className="w-4 h-4 mr-2" /> Print Invoice
        </Button>
      </div>

      <Card className="p-10 bg-white text-black shadow-sm print:shadow-none print:border-none">
        {/* Header */}
        <div className="flex justify-between items-start border-b border-gray-200 pb-8 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-600 text-white rounded flex items-center justify-center print:bg-black">
              <Hospital className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">MediCare Hospital</h1>
              <p className="text-sm text-gray-500">123 Health Avenue, Medical District</p>
              <p className="text-sm text-gray-500">New Delhi, India 110001 • GSTIN: 07AABCU9603R1ZX</p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold text-gray-900">TAX INVOICE</h2>
            <p className="text-sm text-gray-500 mt-1 font-mono">{bill.billNumber}</p>
            <p className="text-sm text-gray-500">{new Date(bill.createdAt).toLocaleDateString('en-IN')}</p>
            <div className="mt-2">
              {bill.status === 'paid' ? (
                <span className="inline-flex px-2 py-1 text-xs font-bold bg-green-100 text-green-800 rounded">PAID</span>
              ) : (
                <span className="inline-flex px-2 py-1 text-xs font-bold bg-red-100 text-red-800 rounded">UNPAID</span>
              )}
            </div>
          </div>
        </div>

        {/* Patient Info */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Billed To</h3>
            <p className="font-semibold text-gray-900">{bill.patientName}</p>
            <p className="text-sm text-gray-600">Patient ID: {bill.patientId}</p>
            {bill.insuranceProvider && (
              <p className="text-sm text-gray-600 mt-1">Insurance: {bill.insuranceProvider}</p>
            )}
          </div>
        </div>

        {/* Items */}
        <div className="mb-8">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 border-y border-gray-200">
              <tr>
                <th className="py-3 px-4 text-left font-semibold">Description</th>
                <th className="py-3 px-4 text-right font-semibold">Qty</th>
                <th className="py-3 px-4 text-right font-semibold">Rate</th>
                <th className="py-3 px-4 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bill.items.map((item: any, i: number) => (
                <tr key={i}>
                  <td className="py-3 px-4 text-gray-900">{item.description}</td>
                  <td className="py-3 px-4 text-right text-gray-600">{item.quantity}</td>
                  <td className="py-3 px-4 text-right text-gray-600">₹{item.unitPrice.toLocaleString('en-IN')}</td>
                  <td className="py-3 px-4 text-right text-gray-900 font-medium">₹{item.amount.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-72 space-y-3 text-sm">
            <div className="flex justify-between text-gray-600 px-4">
              <span>Subtotal</span>
              <span className="font-medium text-gray-900">₹{bill.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            {bill.cgst > 0 && (
              <div className="flex justify-between text-gray-600 px-4">
                <span>CGST (9%)</span>
                <span>₹{bill.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {bill.sgst > 0 && (
              <div className="flex justify-between text-gray-600 px-4">
                <span>SGST (9%)</span>
                <span>₹{bill.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {bill.igst > 0 && (
              <div className="flex justify-between text-gray-600 px-4">
                <span>IGST (18%)</span>
                <span>₹{bill.igst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-200 pt-3 px-4">
              <span>Grand Total</span>
              <span>₹{bill.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-gray-200 text-center text-xs text-gray-500">
          <p>Thank you for choosing MediCare Hospital. Wishing you a speedy recovery.</p>
          <p className="mt-1">This is a computer generated invoice and does not require a physical signature.</p>
        </div>
      </Card>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          .print\\:border-none {
            border: none !important;
          }
          .print\\:bg-black {
            background-color: black !important;
            -webkit-print-color-adjust: exact;
          }
          Card, Card * {
            visibility: visible;
          }
          Card {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
