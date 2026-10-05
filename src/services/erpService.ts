import { apiRequest } from '../api/client';

export interface ERPStockItem {
  stockCode: string;
  description: string;
  unitOfMeasure: string;
  productClass?: string;
  price?: number;
  taxRate?: number;
}

export interface ERPPriceResult {
  stockCode: string;
  price: number;
  currency: string;
  priceFound: boolean;
}

export interface ERPTaxResult {
  stockCode?: string;
  taxRate: number;
  taxCategory?: string;
}

export const erpService = {
  /**
   * Search / retrieve stock codes from the connected ERP
   */
  async getStockCodes(query?: string): Promise<ERPStockItem[]> {
    try {
      const q = query ? `?q=${encodeURIComponent(query)}` : '';
      const res = await apiRequest<ERPStockItem[]>(`/erp/stock-codes${q}`, {
        method: 'GET',
      });
      return res.data || [];
    } catch {
      return [];
    }
  },

  /**
   * Pull item price from active ERP for a stockCode
   */
  async getItemPrice(stockCode: string, supplierCode?: string): Promise<ERPPriceResult | null> {
    try {
      const sup = supplierCode ? `&supplierCode=${encodeURIComponent(supplierCode)}` : '';
      const res = await apiRequest<ERPPriceResult>(
        `/erp/item-price?stockCode=${encodeURIComponent(stockCode)}${sup}`,
        { method: 'GET' }
      );
      return res.data || null;
    } catch {
      return null;
    }
  },

  /**
   * Pull tax rate percentage from active ERP
   */
  async getTaxRate(stockCode?: string, category?: string): Promise<ERPTaxResult | null> {
    try {
      const params = new URLSearchParams();
      if (stockCode) params.set('stockCode', stockCode);
      if (category) params.set('category', category);
      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const res = await apiRequest<ERPTaxResult>(`/erp/tax-rate${queryStr}`, {
        method: 'GET',
      });
      return res.data || null;
    } catch {
      return null;
    }
  },
};
