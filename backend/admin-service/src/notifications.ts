export const sendEmailAlert = async (flagKey: string, oldState: boolean, newState: boolean, reason: string, user: string) => {
  const statusColor = newState ? '#22c55e' : '#ef4444';
  const htmlTemplate = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <div style="background-color: ${statusColor}; color: white; padding: 16px;">
        <h2 style="margin: 0;">Lancar Feature Flag Update</h2>
      </div>
      <div style="padding: 24px; color: #374151;">
        <p><strong>Flag Key:</strong> <code>${flagKey}</code></p>
        <p><strong>Status Changed:</strong> <span style="color: ${oldState ? '#22c55e' : '#ef4444'}; font-weight: bold;">${oldState ? 'ON' : 'OFF'}</span> &rarr; <span style="color: ${statusColor}; font-weight: bold;">${newState ? 'ON' : 'OFF'}</span></p>
        <p><strong>Changed By:</strong> ${user}</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="margin-bottom: 8px;"><strong>Reason for Change:</strong></p>
        <blockquote style="margin: 0; padding: 12px; background-color: #f3f4f6; border-left: 4px solid #9ca3af; font-style: italic;">
          ${reason}
        </blockquote>
      </div>
    </div>
  `;

  // Mock email sending
  console.log('----------------------------------------------------');
  console.log(`[EMAIL ALERT] To be sent as HTML:`);
  console.log(htmlTemplate);
  console.log('----------------------------------------------------');
  return true;
};

export const sendSlackAlert = async (flagKey: string, oldState: boolean, newState: boolean, reason: string, user: string) => {
  // Mock Slack sending
  console.log('----------------------------------------------------');
  console.log(`[SLACK ALERT] 🚀 Feature Flag ${flagKey} toggled to ${newState ? 'ON' : 'OFF'} by ${user}`);
  console.log(`Reason: ${reason}`);
  console.log('----------------------------------------------------');
  return true;
};
