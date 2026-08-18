import { db } from '../config/database.js';
export function findReferrals(specialty = '', location = '', urgency = '') {
  const rows = db.prepare('SELECT * FROM healthcare_facilities ORDER BY emergency_support DESC, name').all();
  const wanted = String(specialty).toLowerCase().replace(' / emergency care','');
  const city = String(location || '').toLowerCase();
  return rows.filter(r => {
    const specialtyMatch = !wanted || r.specialties.toLowerCase().includes(wanted.split(' / ')[0]);
    const locationMatch = !city || r.city.toLowerCase().includes(city);
    const urgencyMatch = urgency !== 'EMERGENCY' || r.emergency_support === 1;
    return specialtyMatch && locationMatch && urgencyMatch;
  }).slice(0, 5);
}
