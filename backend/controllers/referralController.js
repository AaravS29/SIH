import { findReferrals } from '../services/referralService.js';
export function getReferrals(req, res) { res.json({ referrals: findReferrals(req.query.specialty, req.query.location, req.query.urgency) }); }
