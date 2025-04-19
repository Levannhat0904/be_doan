// be/src/routes/invoiceRoutes.ts

import express from 'express';
import * as InvoiceController from '../controllers/invoiceController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { isAdmin } from '../middlewares/roleMiddleware';

const router = express.Router();

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

export default router;