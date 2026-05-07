#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import assemblyai as aai
import os
import sys
import math
import glob
import io
import re
import time

# Configurar stdout para UTF-8 no Windows
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# --- Configurações Fixas ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "legendas") # Salvar SRTs na pasta legendas
API_KEY_FILE = os.path.join(BASE_DIR, "chave-api-assemblyai.txt") # Arquivo da chave API na pasta do script
DELAY_BETWEEN_REQUESTS = 3 # Delay em segundos entre requisições
SENTENCE_END_REGEX = re.compile(r"[.!?]+(?:[\"'”’)\]]+)?$")
# --------------------------

# Função para formatar milissegundos para o formato de tempo SRT HH:MM:SS,ms
def format_srt_time(milliseconds):
    if milliseconds < 0:
        milliseconds = 0 # Garante que não haja tempos negativos
    seconds = milliseconds / 1000
    minutes = seconds // 60
    hours = minutes // 60
    milliseconds_rem = milliseconds % 1000
    seconds_rem = math.floor(seconds % 60)
    minutes_rem = math.floor(minutes % 60)
    return f"{int(hours):02}:{int(minutes_rem):02}:{int(seconds_rem):02},{int(milliseconds_rem):03}"

# Função para ler a chave da API de um arquivo
def get_api_keys(key_file):
    abs_key_file = os.path.abspath(key_file)
    if not os.path.exists(abs_key_file):
        print(f"Erro: Arquivo de chave API nao encontrado: {abs_key_file}", file=sys.stderr)
        return []
    try:
        with open(abs_key_file, "r", encoding="utf-8") as f:
            api_keys = [line.strip() for line in f.readlines() if line.strip()]
            if not api_keys:
                print(f"Erro: Nenhuma chave API encontrada no arquivo {abs_key_file}", file=sys.stderr)
                return []
            return api_keys
    except Exception as e:
        print(f"Erro ao ler o arquivo de chave API {abs_key_file}: {e}", file=sys.stderr)
        return []

def is_sentence_end(word_text):
    return bool(SENTENCE_END_REGEX.search(word_text.strip()))

# Função para gerar conteúdo SRT
def generate_srt(transcript):
    if not transcript or not transcript.words:
        print("Aviso: Nenhuma palavra foi detectada na transcricao.", file=sys.stderr)
        return ""

    srt_content = []
    segment_count = 1
    current_line_words = []

    for i, word in enumerate(transcript.words):
        current_line_words.append(word)

        # Cria uma nova linha quando encontrar o fim de frase ou chegar à última palavra.
        if is_sentence_end(word.text) or i == len(transcript.words) - 1:
            # Start time: primeira palavra da linha atual
            start_time = current_line_words[0].start
            
            # End time: última palavra da linha atual (dados reais do AssemblyAI)
            last_word = current_line_words[-1]
            end_time = last_word.end
            
            line_text = " ".join([w.text for w in current_line_words])

            srt_content.append(str(segment_count))
            srt_content.append(f"{format_srt_time(start_time)} --> {format_srt_time(end_time)}")
            srt_content.append(line_text)
            srt_content.append("")

            segment_count += 1
            current_line_words = []

    return "\n".join(srt_content)

def process_audio_file(audio_path, output_dir, config, api_keys, current_key_index):
    """Processa um único arquivo de áudio, salva o SRT no diretório de saída."""
    base_name = os.path.splitext(os.path.basename(audio_path))[0]
    output_srt_path = os.path.join(output_dir, f"{base_name}.srt")

    print(f"\nProcessando arquivo: {os.path.basename(audio_path)}")
    print(f"Arquivo SRT de saida sera: {output_srt_path}")

    # Tenta com cada chave API disponível
    for attempt in range(len(api_keys)):
        key_index = (current_key_index + attempt) % len(api_keys)
        current_key = api_keys[key_index]
        
        print(f"Tentativa {attempt + 1} - Usando chave API #{key_index + 1}")
        aai.settings.api_key = current_key
        
        transcriber = aai.Transcriber()

        try:
            transcript = transcriber.transcribe(audio_path, config=config)
            
            if transcript.status == aai.TranscriptStatus.error:
                print(f"Erro na transcricao com chave #{key_index + 1}: {transcript.error}", file=sys.stderr)
                if attempt < len(api_keys) - 1:
                    print("Tentando com proxima chave API...")
                    continue
                else:
                    return False, (key_index + 1) % len(api_keys)
                    
            elif transcript.status == aai.TranscriptStatus.completed:
                detected_lang = getattr(transcript, 'language_code', None)
                detected_confidence = getattr(transcript, 'language_confidence', None)
                if detected_lang:
                    print(f"Idioma detectado: {detected_lang} (Confianca: {detected_confidence})")

                print(f"Transcricao concluida com sucesso para {os.path.basename(audio_path)}.")
                srt_data = generate_srt(transcript)

                try:
                    with open(output_srt_path, "w", encoding="utf-8") as f:
                        f.write(srt_data)
                    print(f"Arquivo SRT gerado com sucesso: {output_srt_path}")
                    return True, (key_index + 1) % len(api_keys)
                except IOError as e:
                    print(f"Erro ao escrever o arquivo SRT {output_srt_path}: {e}", file=sys.stderr)
                    return False, (key_index + 1) % len(api_keys)
            else:
                print(f"Status inesperado: {transcript.status}", file=sys.stderr)
                if attempt < len(api_keys) - 1:
                    print("Tentando com proxima chave API...")
                    continue
                    
        except Exception as e:
            print(f"Erro com chave #{key_index + 1}: {e}", file=sys.stderr)
            if attempt < len(api_keys) - 1:
                print("Tentando com proxima chave API...")
                continue
            else:
                return False, (key_index + 1) % len(api_keys)
    
    return False, current_key_index

def main():
    print("Iniciando script de transcricao de audio para SRT...")
    
    # Pedir o caminho da pasta ao usuário
    input_path = input("Digite o caminho da pasta com os arquivos de audio: ").strip()
    
    # Remove aspas se o usuário colou um caminho com aspas
    if input_path.startswith('"') and input_path.endswith('"'):
        input_path = input_path[1:-1]
    
    input_directory_abs = os.path.abspath(input_path)
    output_directory_abs = os.path.abspath(OUTPUT_DIR)
    
    print(f"Usando diretorio de entrada: {input_directory_abs}")
    print(f"Usando diretorio de saida: {output_directory_abs}")
    print(f"Usando arquivo de chave API: {API_KEY_FILE}")
    print("Segmentacao SRT: por frase (ate ., ! ou ?)")
    print(f"Delay entre requisicoes: {DELAY_BETWEEN_REQUESTS} segundos")

    # Verifica se o diretório de entrada existe
    if not os.path.isdir(input_directory_abs):
        print(f"Erro: Diretorio de entrada nao existe: {input_directory_abs}", file=sys.stderr)
        sys.exit(1)

    # Cria o diretório de saída se não existir
    if not os.path.exists(output_directory_abs):
        try:
            os.makedirs(output_directory_abs)
            print(f"Diretorio de saida criado: {output_directory_abs}")
        except OSError as e:
            print(f"Erro ao criar o diretorio de saida {output_directory_abs}: {e}", file=sys.stderr)
            sys.exit(1)

    # Lê múltiplas chaves da API
    api_keys = get_api_keys(API_KEY_FILE)
    if not api_keys:
        print(f"Erro critico: Nao foi possivel obter chaves da API do arquivo {API_KEY_FILE}", file=sys.stderr)
        sys.exit(1)
    
    print(f"Carregadas {len(api_keys)} chave(s) API para revezamento.")

    print("Configurando para usar deteccao automatica de idioma para todos os arquivos.")
    config = aai.TranscriptionConfig(language_detection=True)

    print(f"Procurando arquivos .mp3, .wav e .mp4 em: {input_directory_abs}")
    audio_files = glob.glob(os.path.join(input_directory_abs, "*.mp3")) + glob.glob(os.path.join(input_directory_abs, "*.wav")) + glob.glob(os.path.join(input_directory_abs, "*.mp4"))

    if not audio_files:
        print(f"Nenhum arquivo .mp3, .wav ou .mp4 encontrado em {input_directory_abs}")
        sys.exit(0)

    print(f"Encontrados {len(audio_files)} arquivos de audio para processar:")
    for f in audio_files:
        print(f" - {os.path.basename(f)}")

    success_count = 0
    failure_count = 0
    current_key_index = 0
    
    for i, audio_path in enumerate(audio_files):
        print(f"\n--- Processando arquivo {i+1} de {len(audio_files)} ---")
        
        success, next_key_index = process_audio_file(audio_path, output_directory_abs, config, api_keys, current_key_index)
        current_key_index = next_key_index
        
        if success:
            success_count += 1
        else:
            failure_count += 1
        
        # Adiciona delay entre requisições, exceto após o último arquivo
        if i < len(audio_files) - 1:
            print(f"Aguardando {DELAY_BETWEEN_REQUESTS} segundos antes do proximo arquivo...")
            time.sleep(DELAY_BETWEEN_REQUESTS)

    print(f"\nProcessamento concluido. {success_count} sucesso(s), {failure_count} falha(s).") 

if __name__ == "__main__":
    main()
