import { Router } from 'express';
import { getReferrals } from '../controllers/referralController.js';
const router = Router();
router.get('/', getReferrals);
export default router;
