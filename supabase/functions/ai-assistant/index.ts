import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, context } = await req.json();
    
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }

    // System prompt específico para o contexto da academia
    const systemPrompt = `Você é um assistente inteligente para um sistema de gestão de academia de musculação. 

Contexto do sistema:
- Você ajuda com gestão de alunos, mensagens automáticas, avaliações físicas e análise de dados
- O sistema permite cadastrar alunos, enviar mensagens via WhatsApp, agendar mensagens e acompanhar avaliações
- Você pode sugerir mensagens personalizadas, dar dicas de gestão e analisar informações dos alunos

Instruções:
- Seja sempre útil, profissional e focado no contexto de academia
- Dê respostas práticas e acionáveis
- Quando sugerir mensagens, use uma linguagem amigável e motivacional
- Mantenha as respostas concisas mas informativas
- Use emojis moderadamente para deixar as respostas mais amigáveis

Dados disponíveis no sistema:
${context ? JSON.stringify(context, null, 2) : 'Nenhum contexto específico fornecido'}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${systemPrompt}\n\nUsuário: ${message}`
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1000,
        }
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Gemini API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const assistantMessage = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Desculpe, não consegui gerar uma resposta.';

    return new Response(JSON.stringify({ 
      message: assistantMessage,
      usage: data.usageMetadata || null
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-assistant function:', error);
    return new Response(JSON.stringify({ 
      error: 'Erro interno do servidor',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});