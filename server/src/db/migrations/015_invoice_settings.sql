INSERT INTO settings (key, value, category, label) VALUES
  ('shop_logo',                      '', 'shop',          'Shop Logo URL'),
  ('app_base_url',                   '', 'notifications',  'App Base URL (for invoice links)'),
  ('whatsapp_cloud_phone_number_id', '', 'notifications',  'WhatsApp Cloud Phone Number ID'),
  ('whatsapp_cloud_access_token',    '', 'notifications',  'WhatsApp Cloud Access Token')
ON CONFLICT (key) DO NOTHING;
