# Resumo do Projeto: Content OS - Writer Studio Cloud

Este documento fornece uma visão técnica e funcional completa do ecossistema **Content OS**, um motor estratégico para gestão e automação de conteúdo para YouTube, focado em engenharia de prompt de alta precisão e rastreabilidade de dados.

---

## 1. Visão Geral (O que é?)
O **Content OS** é uma plataforma de inteligência editorial projetada para transformar temas brutos em roteiros e títulos de alta performance. Diferente de geradores genéricos, ele utiliza uma arquitetura **DB-Driven** para garantir que a IA utilize apenas o vocabulário técnico, metáforas e ganchos estratégicos previamente cadastrados pelo usuário no banco de dados.

## 2. Arquitetura Técnica
O projeto é construído sobre o stack moderno de desenvolvimento web:

- **Framework**: [Next.js 16.2.2](https://nextjs.org/) (App Router)
- **UI & Logic**: [React 19](https://react.dev/), TypeScript.
- **Estilização**: [Tailwind CSS 4.2.2](https://tailwindcss.com/) com design focado em estética premium e "Sênior Mode".
- **Backend/Database**: [Supabase](https://supabase.com/) (PostgreSQL) para persistência em nuvem e LocalStorage para chaves de API.
- **Ícones**: [Lucide React](https://lucide.dev/).
- **Charts**: [Recharts](https://recharts.org/) para análise de Match Score e BI.

## 3. Core Engine: Prompt Antigravity (V6)
O coração da aplicação é o motor de síntese, que opera sob quatro pilares:

1.  **Agnóstico de Conteúdo**: A IA não "inventa" conceitos; ela processa os ativos da `metaphor_library` e `narrative_library`.
2.  **Zero Abstração Baseada (Zero Leak)**: Filtro rigoroso que impede termos do sistema (M1, S1, IDs internos) de vazarem para o título final.
3.  **Persona "Sênior no Café"**: Tom de voz técnico, cético e pragmático, fugindo de clichês de marketing.
4.  **Composition Log (DNA)**: Cada conteúdo gerado salva um log de quais hooks, metáforas e estruturas foram usados para permitir análise de performance (BI).

## 4. Integração Multi-LLM
A aplicação suporta alternância em tempo real entre provedores:

- **OpenAI**: Suporte a modelos GPT-4o, GPT-5 e modelos de raciocínio (logic bypass para o parâmetro `temperature`).
- **Google Gemini**: Integração via API `v1beta` com suporte a Gemini 2.x e 3.x Flash/Pro.
- **Sistema de Aliasing**: Um mapa de resolução (`resolveModel`) garante que IDs da interface carreguem os endpoints corretos da API, corrigindo erros de descontinuidade de modelos automaticamente.

## 5. Estrutura de Dados (Supabase)
Principais tabelas definidas em `migration.sql`:

- `projects`: Configurações centrais, `ai_engine_rules` (JSONB) e diretrizes de voz.
- `content_hub`: Registro de temas, títulos virais e status de produção.
- `narrative_components`: Biblioteca de Hooks, CTAs e Estruturas de Título (S1-S5).
- `analytics`: Onde o `composition_log` é cruzado com métricas reais de visualização e retenção.

## 6. Fluxo de Trabalho
1.  **Wizard**: Definição do Projeto, Metáforas e Persona.
2.  **Hub**: Criação de temas dentro da jornada tática (M1-M3).
3.  **Síntese**: Geração de 5 variações estratégicas (S1-S5) via Engine Antigravity.
4.  **Roteirização**: Transformação do título eleito em roteiro completo pronto para gravação.

---
*Gerado automaticamente para documentação sistêmica.*
