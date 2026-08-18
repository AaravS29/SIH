import { triageSchema } from '../utils/validation.js';
import { assessTriage } from '../services/triageService.js';
import { db } from '../config/database.js';
import { findReferrals } from '../services/referralService.js';
export async function createTriage(req, res, next) {
  try {
    const input = triageSchema.parse(req.body);
    const result = await assessTriage(input);
    const referrals = findReferrals(result.specialty, input.location, result.urgency);
    const stmt = db.prepare(`INSERT INTO triage_requests (symptoms,age,duration,severity,existing_conditions,medications,location,urgency,specialty,reason,recommended_action) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    const saved = stmt.run(JSON.stringify(input.symptoms), input.age ?? null, input.duration ?? null, input.severity, JSON.stringify(input.existingConditions || []), JSON.stringify(input.medications || []), input.location || null, result.urgency, result.specialty, result.reason, result.recommendedAction);
    res.status(201).json({ id: saved.lastInsertRowid, ...result, referrals });
  } catch (error) { next(error); }
}
