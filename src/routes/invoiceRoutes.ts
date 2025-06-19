// be/src/routes/invoiceRoutes.ts

import express from 'express';
import * as InvoiceController from '../controllers/invoiceController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { isAdmin } from '../middlewares/roleMiddleware';

const router = express.Router();

// Get all invoices with pagination and filtering
router.get(
  '/invoices',
  authMiddleware,
  isAdmin,
  (req, res, next) => {
    InvoiceController.getAllInvoices(req, res).catch(next);
  }
);

// Get invoice by ID
router.get(
  '/invoices/:invoiceId',
  authMiddleware,
  (req, res, next) => {
    InvoiceController.getInvoiceById(req, res).catch(next);
  }
);

// Get invoices by room
router.get(
  '/rooms/:roomId/invoices',
  authMiddleware,
  (req, res, next) => {
    InvoiceController.getInvoicesByRoom(req, res).catch(next);
  }
);

// Create new invoice for a room
router.post(
  '/rooms/:roomId/invoices',
  authMiddleware,
  isAdmin,
  (req, res, next) => {
    InvoiceController.createInvoice(req, res).catch(next);
  }
);

// Update invoice status
router.put(
  '/invoices/:invoiceId/status',
  authMiddleware,
  isAdmin,
  (req, res, next) => {
    InvoiceController.updateInvoiceStatus(req, res).catch(next);
  }
);

// Delete invoice
router.delete(
  '/invoices/:invoiceId',
  authMiddleware,
  isAdmin,
  (req, res, next) => {
    InvoiceController.deleteInvoice(req, res).catch(next);
  }
);

// Update invoice
router.patch(
  '/invoices/:invoiceId',
  authMiddleware,
  isAdmin,
  (req, res, next) => {
    InvoiceController.updateInvoice(req, res).catch(next);
  }
);

// Public API for invoice lookup (does not require authentication)
router.get(
  '/public/invoices/search',
  (req, res, next) => {
    InvoiceController.searchInvoices(req, res).catch(next);
  }
);

// Public API endpoints for select components
router.get(
  '/public/students/codes',
  (req, res, next) => {
    InvoiceController.getStudentCodes(req, res).catch(next);
  }
);

router.get(
  '/public/rooms/numbers',
  (req, res, next) => {
    InvoiceController.getRoomNumbers(req, res).catch(next);
  }
);

// Student payment route - requires authentication but not admin
router.post(
  '/invoices/:invoiceId/payment',
  authMiddleware,
  (req, res, next) => {
    InvoiceController.submitInvoicePayment(req, res).catch(next);
  }
);

// Đổi route thống kê hóa đơn thành /invoices-stats
router.get(
  '/invoices-stats',
  authMiddleware,
  isAdmin,
  (req, res, next) => {
    InvoiceController.getInvoiceStats(req, res).catch(next);
  }
);

export default router;