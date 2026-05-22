INSERT INTO settings (key, value, category, label) VALUES
  ('whatsapp_business_number', '', 'notifications', 'WhatsApp Business Number'),
  ('whatsapp_mode',            'wame', 'notifications', 'WhatsApp Sending Mode')
ON CONFLICT (key) DO NOTHING;
