import cron from 'node-cron';
import { db } from '../config/database';
import {
  sendSmsAndWhatsapp,
  buildPickupReminderMessage,
  buildReturnReminderMessage,
  buildLateReturnMessage,
} from './notificationService';

export function startScheduler(): void {
  console.log('⏰ Starting notification scheduler...');

  // Daily 9:00 AM — Pickup reminders (rentals starting tomorrow)
  cron.schedule('0 9 * * *', async () => {
    try {
      await sendPickupReminders();
    } catch (err) {
      console.error('Pickup reminder job failed:', err);
    }
  });

  // Daily 9:00 AM — Return reminders (rentals ending today)
  cron.schedule('0 9 * * *', async () => {
    try {
      await sendReturnReminders();
    } catch (err) {
      console.error('Return reminder job failed:', err);
    }
  });

  // Daily 6:00 AM — Late return warnings
  cron.schedule('0 6 * * *', async () => {
    try {
      await sendLateReturnWarnings();
    } catch (err) {
      console.error('Late return warning job failed:', err);
    }
  });

  // Daily midnight — Update overdue rental statuses
  cron.schedule('0 0 * * *', async () => {
    try {
      await updateOverdueStatuses();
    } catch (err) {
      console.error('Status update job failed:', err);
    }
  });

  console.log('✅ Scheduler started');
}

async function sendPickupReminders(): Promise<void> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const res = await db.query(`
    SELECT r.id, r.booking_number, r.rental_start_date,
           c.name as customer_name, c.phone, c.whatsapp, c.email, c.id as customer_id
    FROM rentals r
    JOIN customers c ON c.id = r.customer_id
    WHERE r.rental_start_date = $1 AND r.status = 'reserved'
  `, [tomorrowStr]);

  for (const rental of res.rows) {
    const message = buildPickupReminderMessage({
      customerName: rental.customer_name,
      bookingNumber: rental.booking_number,
      pickupDate: tomorrowStr,
    });

    await sendSmsAndWhatsapp({ rentalId: rental.id, customerId: rental.customer_id, type: 'pickup_reminder', phone: rental.phone, whatsapp: rental.whatsapp, message });
  }

  if (res.rows.length > 0) {
    console.log(`[Scheduler] Sent ${res.rows.length} pickup reminders`);
  }
}

async function sendReturnReminders(): Promise<void> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const res = await db.query(`
    SELECT r.id, r.booking_number, r.rental_end_date,
           c.name as customer_name, c.phone, c.whatsapp, c.id as customer_id
    FROM rentals r
    JOIN customers c ON c.id = r.customer_id
    WHERE r.rental_end_date = $1 AND r.status = 'picked_up'
  `, [tomorrowStr]);

  for (const rental of res.rows) {
    const message = buildReturnReminderMessage({
      customerName: rental.customer_name,
      bookingNumber: rental.booking_number,
      returnDate: tomorrowStr,
    });

    await sendSmsAndWhatsapp({ rentalId: rental.id, customerId: rental.customer_id, type: 'return_reminder', phone: rental.phone, whatsapp: rental.whatsapp, message });
  }
}

async function sendLateReturnWarnings(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  const res = await db.query(`
    SELECT r.id, r.booking_number, r.rental_end_date,
           c.name as customer_name, c.phone, c.whatsapp, c.id as customer_id,
           CURRENT_DATE - r.rental_end_date as days_late,
           COALESCE(SUM(ri.rental_price_per_day * ri.quantity), 0) as daily_rate
    FROM rentals r
    JOIN customers c ON c.id = r.customer_id
    JOIN rental_items ri ON ri.rental_id = r.id
    WHERE r.rental_end_date < $1 AND r.status IN ('picked_up', 'late_return')
    GROUP BY r.id, c.id
  `, [today]);

  for (const rental of res.rows) {
    const finePerDay = 20; // Default fine per day
    const totalFine = rental.days_late * finePerDay;
    const message = buildLateReturnMessage({
      customerName: rental.customer_name,
      bookingNumber: rental.booking_number,
      daysLate: rental.days_late,
      fineAmount: totalFine,
    });

    await sendSmsAndWhatsapp({ rentalId: rental.id, customerId: rental.customer_id, type: 'late_warning', phone: rental.phone, whatsapp: rental.whatsapp, message });
  }
}

async function updateOverdueStatuses(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const res = await db.query(`
    UPDATE rentals SET status = 'late_return', updated_at = NOW()
    WHERE rental_end_date < $1 AND status = 'picked_up'
    RETURNING id
  `, [today]);

  if (res.rowCount && res.rowCount > 0) {
    console.log(`[Scheduler] Marked ${res.rowCount} rentals as late_return`);
  }
}
