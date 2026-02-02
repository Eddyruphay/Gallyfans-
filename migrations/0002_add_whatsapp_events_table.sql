CREATE TABLE whatsapp_events (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE, -- O ID da mensagem/evento do WhatsApp para evitar duplicatas
  group_id TEXT NOT NULL, -- ID do grupo onde o evento ocorreu
  sender_id TEXT, -- Quem enviou a mensagem/reação
  event_type TEXT NOT NULL, -- Ex: 'message', 'reaction'
  event_timestamp TEXT NOT NULL,
  message_body TEXT, -- O conteúdo da mensagem de texto
  quoted_message_id TEXT, -- Se for uma resposta, o ID da mensagem original
  raw_payload TEXT -- O objeto JSON completo do evento, para futuras análises
);
