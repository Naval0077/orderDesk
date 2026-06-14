module.exports = function handler(req, res) {
  res.status(200).json({ 
    status: 'ok', 
    service: 'OrderDesk',
    time: new Date().toISOString(),
    env: {
      hasWaToken:    !!process.env.WHATSAPP_TOKEN,
      hasVerifyToken:!!process.env.WHATSAPP_VERIFY_TOKEN,
      hasPhoneId:    !!process.env.WHATSAPP_PHONE_ID,
      hasDefaultUid: !!process.env.DEFAULT_UID,
      hasFbSa:       !!process.env.FIREBASE_SERVICE_ACCOUNT,
    }
  })
}