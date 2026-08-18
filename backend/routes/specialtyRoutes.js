import { Router } from 'express';
const router = Router();
const specialties = ['General Medicine','Cardiology / Emergency Care','Respiratory / Emergency Care','Neurology / Emergency Care','Dermatology','Orthopedics'];
router.get('/', (_req,res) => res.json({ specialties }));
export default router;
