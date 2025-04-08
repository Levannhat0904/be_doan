import { Router, Request, Response } from 'express';
import { getProvinces, getDistricts, getWards } from '../controllers/administrativeController';

const router = Router();

// Get all provinces
router.get('/provinces', getProvinces as (req: Request, res: Response) => void);

// Get districts by province code
router.get('/provinces/:provinceCode/districts', getDistricts as (req: Request, res: Response) => void);

// Get wards by province code and district code
router.get('/provinces/:provinceCode/districts/:districtCode/wards', getWards as (req: Request, res: Response) => void);

export default router; 