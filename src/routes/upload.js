// ─── ROUTE UPLOAD PHOTO ───────────────────────────────────────────
// POST /api/upload/photo
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// POST /api/upload/photo
// Body: { base64: 'data:image/jpeg;base64,...', fileName: 'photo.jpg' }
router.post('/photo', authenticate, async (req, res) => {
  try {
    const { base64, fileName } = req.body;
    if (!base64 || !fileName) {
      return res.status(400).json({ error: 'base64 et fileName requis' });
    }

    // Extraire le contenu base64 (retirer le préfixe data:image/...;base64,)
    const matches = base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Format base64 invalide' });
    }
    const mimeType = matches[1];
    const buffer   = Buffer.from(matches[2], 'base64');

    // Nom unique : userId_timestamp_fileName
    const ext      = fileName.split('.').pop() || 'jpg';
    const filePath = `${req.user.id}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('photos')
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      console.error('[Upload] Supabase error:', error);
      return res.status(500).json({ error: 'Erreur upload Supabase' });
    }

    // Construire l'URL publique
    const { data } = supabase.storage.from('photos').getPublicUrl(filePath);

    return res.json({ success: true, url: data.publicUrl });
  } catch (err) {
    console.error('[Upload] error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
