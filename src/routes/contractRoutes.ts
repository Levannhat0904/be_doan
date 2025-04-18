import express from 'express';
import * as ContractController from '../controllers/contractController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { isAdmin } from '../middlewares/roleMiddleware';

const router = express.Router();

// Create new contract
router.post(
  '/contracts',
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

export default router;
