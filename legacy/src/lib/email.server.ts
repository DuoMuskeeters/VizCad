import { Resend } from "resend";

export async function sendInvitationEmail({
    resendApiKey,
    to,
    fileName,
    invitedBy,
    token,
    baseURL,
}: {
    resendApiKey: string;
    to: string;
    fileName: string;
    invitedBy: string;
    token: string;
    baseURL: string;
}) {
    const resend = new Resend(resendApiKey);
    const inviteUrl = `${baseURL}/signup?invite=${token}`;

    return await resend.emails.send({
        from: "VizCad <noreply@viz-cad.com>",
        to,
        subject: `You've been invited to collaborate on ${fileName}`,
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background-color: #f8fafc; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0;">
          <h1 style="color: #0891b2; margin-top: 0;">Document Invitation</h1>
          <p style="font-size: 16px; line-height: 1.5;">Hi,</p>
          <p style="font-size: 16px; line-height: 1.5;">
            <strong>${invitedBy}</strong> has invited you to collaborate on the file <strong>${fileName}</strong> on VizCad.
          </p>
          <p style="font-size: 16px; line-height: 1.5;">
            To access this document and start collaborating, please click the button below:
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${inviteUrl}" style="display: inline-block; background-color: #0891b2; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
              Accept Invitation
            </a>
          </div>
          <p style="color: #64748b; font-size: 14px; text-align: center;">
            Or copy and paste this link: <br/>
            <span style="color: #0891b2; word-break: break-all;">${inviteUrl}</span>
          </p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
          <p style="color: #94a3b8; font-size: 12px; line-height: 1.5;">
            If you already have an account, the document will be automatically shared with you after you click the link and log in.
          </p>
        </div>
      </div>
    `,
    });
}
