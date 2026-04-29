import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { supabase } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendMessageRequest {
  students: Array<{
    id: string;
    name: string;
    phone: string;
  }>;
  message: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioWhatsAppNumber = Deno.env.get('TWILIO_WHATSAPP_NUMBER'); // e.g., "whatsapp:+14155238886"

    if (!twilioAccountSid || !twilioAuthToken || !twilioWhatsAppNumber) {
      console.error('Missing Twilio credentials');
      return new Response(
        JSON.stringify({ 
          error: 'Twilio credentials not configured',
          details: 'Please configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_NUMBER'
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { students, message }: SendMessageRequest = await req.json();

    if (!students || !Array.isArray(students) || students.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No students provided' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!message || message.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'No message provided' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const results = [];
    const messagesToSave = [];

    // Send messages to each student via Twilio
    for (const student of students) {
      try {
        // Format phone number for WhatsApp (must include country code)
        let formattedPhone = student.phone.replace(/\D/g, ''); // Remove non-digits
        if (!formattedPhone.startsWith('55')) {
          formattedPhone = '55' + formattedPhone; // Add Brazil country code
        }
        formattedPhone = `whatsapp:+${formattedPhone}`;

        console.log(`Sending message to ${student.name} at ${formattedPhone}`);

        // Create Twilio API credentials
        const credentials = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

        // Send WhatsApp message via Twilio
        const twilioResponse = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${credentials}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              From: twilioWhatsAppNumber,
              To: formattedPhone,
              Body: message,
            }),
          }
        );

        const twilioResult = await twilioResponse.json();

        if (twilioResponse.ok) {
          console.log(`Message sent successfully to ${student.name}:`, twilioResult.sid);
          results.push({
            studentId: student.id,
            studentName: student.name,
            phone: student.phone,
            status: 'sent',
            messageSid: twilioResult.sid,
          });

          // Prepare message for database
          messagesToSave.push({
            student_id: student.id,
            content: message,
            status: 'sent',
          });
        } else {
          console.error(`Failed to send message to ${student.name}:`, twilioResult);
          results.push({
            studentId: student.id,
            studentName: student.name,
            phone: student.phone,
            status: 'failed',
            error: twilioResult.message || 'Unknown error',
          });

          // Save failed message to database
          messagesToSave.push({
            student_id: student.id,
            content: message,
            status: 'failed',
          });
        }
      } catch (error) {
        console.error(`Error sending message to ${student.name}:`, error);
        results.push({
          studentId: student.id,
          studentName: student.name,
          phone: student.phone,
          status: 'failed',
          error: error.message || 'Unknown error',
        });

        // Save failed message to database
        messagesToSave.push({
          student_id: student.id,
          content: message,
          status: 'failed',
        });
      }
    }

    // Save all messages to database
    if (messagesToSave.length > 0) {
      const supabaseClient = supabase(
        'https://uesjfpkvzoojhizznaai.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlc2pmcGt2em9vamhpenpuYWFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMDY5NDgsImV4cCI6MjA3MDc4Mjk0OH0.Yk7LLWeZIlVWMMIBZ2XHs8Gy6uzx0Fk5WVpoRCIzF50'
      );

      const { error: dbError } = await supabaseClient
        .from('messages')
        .insert(messagesToSave);

      if (dbError) {
        console.error('Error saving messages to database:', dbError);
      } else {
        console.log(`Saved ${messagesToSave.length} messages to database`);
      }
    }

    const successCount = results.filter(r => r.status === 'sent').length;
    const failureCount = results.filter(r => r.status === 'failed').length;

    return new Response(
      JSON.stringify({
        success: true,
        results,
        summary: {
          total: students.length,
          sent: successCount,
          failed: failureCount,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in send-whatsapp function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});