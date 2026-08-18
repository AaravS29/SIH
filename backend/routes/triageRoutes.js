import { Router } from 'express';
import { createTriage } from '../controllers/triageController.js';
const router = Router();
router.post('/', createTriage);
export default router;
