import express from 'express';
import * as ContractController from '../controllers/contractController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { isAdmin } from '../middlewares/roleMiddleware';

const router = express.Router();

// For debugging - Log all incoming requests to contract routes
router.use((req, res, next) => {
  console.log(`Contract Route: ${req.method} ${req.path}`);
  next();
});

// Create new contract
router.post(
  '/',
  authMiddleware,
  isAdmin,
  (req, res, next) => {
    ContractController.createContract(req, res).catch(next);
  }
);

// Get contracts by student ID
router.get(
  '/students/:studentId/contracts',
  authMiddleware,
  (req, res, next) => {
    ContractController.getContractsByStudent(req, res).catch(next);
  }
);

// Get all contracts
router.get('/', authMiddleware, (req, res, next) => {
  ContractController.getAllContracts(req, res).catch(next);
});

// Get contract by ID
router.get('/:contractId', authMiddleware, (req, res, next) => {
  ContractController.getContractById(req, res).catch(next);
});

// Update contract
router.put('/:contractId', authMiddleware, isAdmin, (req, res, next) => {
  ContractController.updateContract(req, res).catch(next);
});

// Delete contract
router.delete('/:contractId', authMiddleware, isAdmin, (req, res, next) => {
  ContractController.deleteContract(req, res).catch(next);
});

// Get contract timeline
router.get('/:contractId/timeline', authMiddleware, (req, res, next) => {
  ContractController.getContractTimeline(req, res).catch(next);
});

export default router;
