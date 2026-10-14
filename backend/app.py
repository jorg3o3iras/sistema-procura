# -*- coding: utf-8 -*-
"""
Sistema de Procura v3.4 - Backend Flask + Neon PostgreSQL
Reconhecimento facial via Hugging Face Inference API (CLIP + fallback)
"""
import os
import base64
import hashlib
import secrets
from datetime import datetime

from flask import Flask, request, jsonify, g
from flask_cors import CORS
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import pool
import numpy as np
import requests

try:
    import bcrypt
    BCRYPT_OK = True
except ImportError:
    BCRYPT_OK = False

# ============================================================
# CONFIG
# ============================================================
load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")
FLASK_SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", "dev-secret-change-me")
HF_TOKEN = os.environ.get("HF_TOKEN", "")
PORT = int(os.environ.get("PORT", 5000))

# Modelos do Hugging Face (tentados em ordem)
HF_MODELS = [
    "https://api-inference.huggingface.co/models/sentence-transformers/clip-ViT-B-32",
    "https://api-inference.huggingface.co/models/openai/clip-vit-base-patch32",
]

FACE_THRESHOLD = 0.25

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL nao configurada")

FACE_OK = bool(HF_TOKEN)

app = Flask(__name__)
app.secret_key = FLASK_SECRET_KEY

CORS(app, resources={r"/api/*": {"origins": "*"}})

# ============================================================
# POOL DE CONEXOES
# ============================================================
db_pool = pool.SimpleConnectionPool(
    minconn=1,
    maxconn=5,
    dsn=DATABASE_URL,
    sslmode="require"
)

def get_conn():
    if "db" not in g:
        g.db = db_pool.getconn()
    return g.db

@app.teardown_appcontext
def release_conn(exc):
    db = g.pop("db", None)
    if db is not None:
        db_pool.putconn(db)

def query_one(sql, params=()):
    with get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            return dict(row) if row else None

def query_all(sql, params=()):
    with get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]

def execute(sql, params=(), returning=False):
    with get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params)
            result = cur.fetchone() if returning else None
            conn.commit()
            return dict(result) if result else None

# ============================================================
# SEGURANCA
# ============================================================
def hash_senha(senha: str) -> str:
    if BCRYPT_OK:
        return bcrypt.hashpw(senha.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", senha.encode(), salt.encode(), 200_000)
    return f"pbkdf2${salt}${h.hex()}"

def verificar_senha(senha: str, hash_arm: str) -> bool:
    if hash_arm.startswith("pbkdf2$"):
        _, salt, h = hash_arm.split("$", 2)
        calc = hashlib.pbkdf2_hmac("sha256", senha.encode(), salt.encode(), 200_000).hex()
        return secrets.compare_digest(calc, h)
    if BCRYPT_OK:
        try:
            return bcrypt.checkpw(senha.encode("utf-8"), hash_arm.encode("utf-8"))
        except Exception:
            return False
    return False

# ============================================================
# FACE — Hugging Face
# ============================================================
def _extrair_embedding_da_resposta(dados):
    """Tenta extrair embedding de qualquer formato comum do HF."""
    if dados is None:
        return None

    # Formato dict
    if isinstance(dados, dict):
        embs = dados.get("embeddings") or dados.get("embedding")
        if embs:
            if isinstance(embs, list) and embs and isinstance(embs[0], list):
                return np.array(embs[0], dtype=np.float32)
            if isinstance(embs, list) and embs and isinstance(embs[0], (int, float)):
                return np.array(embs, dtype=np.float32)

    # Formato lista
    if isinstance(dados, list):
        if len(dados) == 0:
            return None
        if isinstance(dados[0], list):
            # Pode ser [[emb], [emb]] ou [[emb]]
            inner = dados[0]
            if isinstance(inner, list) and inner and isinstance(inner[0], (int, float)):
                return np.array(inner, dtype=np.float32)
            return np.array(inner, dtype=np.float32)
        if isinstance(dados[0], (int, float)):
            return np.array(dados, dtype=np.float32)

    return None


def gerar_embedding(img_bytes: bytes):
    """Tenta gerar embedding em cada modelo, na ordem de HF_MODELS."""
    if not HF_TOKEN:
        return None

    headers = {
        "Authorization": f"Bearer {HF_TOKEN}",
        "Content-Type": "application/octet-stream",
    }

    for modelo in HF_MODELS:
        try:
            res = requests.post(modelo, headers=headers, data=img_bytes, timeout=60)
            if res.status_code != 200:
                print(f"[HF] {modelo} -> status {res.status_code}: {res.text[:200]}")
                continue

            dados = res.json()
            emb = _extrair_embedding_da_resposta(dados)
            if emb is not None:
                print(f"[HF] OK via {modelo} (dim={len(emb)})")
                return emb
            else:
                print(f"[HF] {modelo} retornou formato inesperado: {str(dados)[:200]}")
        except Exception as e:
            print(f"[HF] {modelo} erro: {e}")
            continue

    return None


def embedding_para_blob(emb):
    if emb is None:
        return None
    return emb.astype(np.float32).tobytes()


def blob_para_embedding(blob):
    if blob is None:
        return None
    if isinstance(blob, memoryview):
        blob = bytes(blob)
    return np.frombuffer(blob, dtype=np.float32)


def normalizar_embedding(emb):
    if emb is None:
        return None
    norm = np.linalg.norm(emb)
    if norm == 0:
        return emb
    return emb / norm

# ============================================================
# AUDITORIA
# ============================================================
def registrar_auditoria(usuario, acao, alvo_id=None, detalhes=""):
    try:
        execute(
            "INSERT INTO auditoria (usuario, acao, alvo_id, detalhes, timestamp) "
            "VALUES (%s, %s, %s, %s, NOW())",
            (usuario, acao, alvo_id, detalhes)
        )
    except Exception as e:
        print(f"[AUDITORIA] {e}")

# ============================================================
# ROTAS — STATUS
# ============================================================
@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "app": "Sistema de Procura API",
        "version": "3.4",
        "face_recognition": FACE_OK,
        "modelos": HF_MODELS,
        "bcrypt": BCRYPT_OK,
        "status": "online"
    })

@app.route("/api/health", methods=["GET"])
def health():
    try:
        query_one("SELECT 1 as ok")
        return jsonify({
            "db": "ok",
            "status": "healthy",
            "face_recognition": FACE_OK
        })
    except Exception as e:
        return jsonify({"db": "error", "detalhes": str(e)}), 500

# ============================================================
# ROTAS — DEBUG HF
# ============================================================
@app.route("/api/debug-hf", methods=["GET"])
def debug_hf():
    """Diagnóstico: testa se o HF está acessível e o que ele responde."""
    resultado = {
        "hf_token_presente": bool(HF_TOKEN),
        "hf_token_tamanho": len(HF_TOKEN) if HF_TOKEN else 0,
        "hf_token_prefixo": (HF_TOKEN[:6] + "...") if HF_TOKEN else "",
        "modelos": HF_MODELS,
    }

    # Teste 1: quem sou eu
    try:
        r = requests.get(
            "https://huggingface.co/api/whoami-v2",
            headers={"Authorization": f"Bearer {HF_TOKEN}"},
            timeout=10,
        )
        resultado["whoami_status"] = r.status_code
        resultado["whoami_resposta"] = r.text[:300]
    except Exception as e:
        resultado["whoami_erro"] = str(e)

    # Teste 2: chamar cada modelo com imagem 1x1 PNG
    img_min = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
        "YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    )
    headers = {
        "Authorization": f"Bearer {HF_TOKEN}",
        "Content-Type": "application/octet-stream",
    }
    for i, modelo in enumerate(HF_MODELS):
        chave = f"modelo_{i+1}"
        try:
            r = requests.post(modelo, headers=headers, data=img_min, timeout=30)
            resultado[chave] = {
                "url": modelo,
                "status": r.status_code,
                "resposta": r.text[:500],
            }
        except Exception as e:
            resultado[chave] = {"url": modelo, "erro": str(e)}

    return jsonify(resultado)

# ============================================================
# ROTAS — LOGIN
# ============================================================
@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    user = (data.get("username") or "").strip()
    senha = data.get("password") or ""
    if not user or not senha:
        return jsonify({"erro": "Preencha usuario e senha"}), 400

    row = query_one("SELECT * FROM usuarios_sistema WHERE username = %s", (user,))
    if not row or not verificar_senha(senha, row["password_hash"]):
        registrar_auditoria(user, "LOGIN_FALHA")
        return jsonify({"erro": "Usuario ou senha incorretos"}), 401

    registrar_auditoria(user, "LOGIN_OK")
    return jsonify({
        "id": row["id"],
        "username": row["username"],
        "role": row.get("role", "user")
    })

# ============================================================
# ROTAS — ESTATISTICAS
# ============================================================
@app.route("/api/estatisticas", methods=["GET"])
def estatisticas():
    try:
        total = query_one("SELECT COUNT(*) AS n FROM registros")["n"]
        com_foto = query_one("SELECT COUNT(DISTINCT registro_id) AS n FROM fotos")["n"]
        com_emb = query_one("SELECT COUNT(DISTINCT registro_id) AS n FROM fotos WHERE embedding IS NOT NULL")["n"]
        com_pdf = query_one("SELECT COUNT(*) AS n FROM registros WHERE pdf IS NOT NULL AND pdf != ''")["n"]
        return jsonify({
            "total": total,
            "com_foto": com_foto,
            "com_embedding": com_emb,
            "com_pdf": com_pdf,
            "sem_foto": total - com_foto
        })
    except Exception as e:
        return jsonify({"erro": str(e)}), 500

# ============================================================
# ROTAS — REGISTROS
# ============================================================
@app.route("/api/registros", methods=["GET"])
def listar_registros():
    rows = query_all("SELECT * FROM registros ORDER BY nome ASC")
    return jsonify([_row_registro(r) for r in rows])

@app.route("/api/registros/<int:rid>", methods=["GET"])
def buscar_registro(rid):
    row = query_one("SELECT * FROM registros WHERE id = %s", (rid,))
    if not row:
        return jsonify({"erro": "Nao encontrado"}), 404
    dados = _row_registro(row)
    fotos = query_all(
        "SELECT id, imagem, ordem FROM fotos WHERE registro_id = %s ORDER BY ordem, id",
        (rid,)
    )
    dados["fotos"] = [
        {"id": f["id"], "dataUrl": _b64(f["imagem"]), "ordem": f["ordem"]}
        for f in fotos
    ]
    return jsonify(dados)

@app.route("/api/registros", methods=["POST"])
def criar_registro():
    data = request.get_json() or {}
    nome = (data.get("nome") or "").strip()
    if not nome:
        return jsonify({"erro": "Nome e obrigatorio"}), 400

    exist = query_one("SELECT id FROM registros WHERE LOWER(nome) = LOWER(%s)", (nome,))
    if exist:
        return jsonify({"erro": f"Ja existe registro com nome '{nome}'"}), 409

    row = execute("""
        INSERT INTO registros
        (nome, rg, apelido, tatuagem, sinais, cor, altura,
         data_nascimento, cidade, observacoes, data_cadastro)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
        RETURNING id
    """, (
        nome,
        data.get("rg", ""), data.get("apelido", ""),
        "; ".join(data.get("tatuagens") or []),
        "; ".join(data.get("sinais") or []),
        data.get("cor", ""), data.get("altura", ""),
        data.get("data_nascimento", ""), data.get("cidade", ""),
        data.get("observacoes", "")
    ), returning=True)
    rid = row["id"]

    for i, foto in enumerate(data.get("fotos") or []):
        try:
            img_bytes = _b64_to_bytes(foto["dataUrl"])
            emb_blob = None
            if FACE_OK:
                emb = gerar_embedding(img_bytes)
                emb_blob = embedding_para_blob(emb)
            execute(
                "INSERT INTO fotos (registro_id, imagem, embedding, ordem, data_cadastro) "
                "VALUES (%s, %s, %s, %s, NOW())",
                (rid, psycopg2.Binary(img_bytes),
                 psycopg2.Binary(emb_blob) if emb_blob else None, i)
            )
        except Exception as e:
            print(f"[FOTO] {e}")

    registrar_auditoria(data.get("usuario", "?"), "CADASTRO", rid, f"Nome: {nome}")
    return jsonify({"id": rid, "ok": True}), 201

@app.route("/api/registros/<int:rid>", methods=["PUT"])
def atualizar_registro(rid):
    data = request.get_json() or {}
    exist = query_one("SELECT id FROM registros WHERE id = %s", (rid,))
    if not exist:
        return jsonify({"erro": "Nao encontrado"}), 404

    execute("""
        UPDATE registros SET
            nome=%s, rg=%s, apelido=%s, tatuagem=%s, sinais=%s,
            cor=%s, altura=%s, data_nascimento=%s, cidade=%s, observacoes=%s
        WHERE id=%s
    """, (
        data.get("nome", ""), data.get("rg", ""), data.get("apelido", ""),
        "; ".join(data.get("tatuagens") or []),
        "; ".join(data.get("sinais") or []),
        data.get("cor", ""), data.get("altura", ""),
        data.get("data_nascimento", ""), data.get("cidade", ""),
        data.get("observacoes", ""), rid
    ))

    if "fotos" in data:
        execute("DELETE FROM fotos WHERE registro_id = %s", (rid,))
        for i, foto in enumerate(data["fotos"]):
            try:
                img_bytes = _b64_to_bytes(foto["dataUrl"])
                emb_blob = None
                if FACE_OK:
                    emb = gerar_embedding(img_bytes)
                    emb_blob = embedding_para_blob(emb)
                execute(
                    "INSERT INTO fotos (registro_id, imagem, embedding, ordem, data_cadastro) "
                    "VALUES (%s, %s, %s, %s, NOW())",
                    (rid, psycopg2.Binary(img_bytes),
                     psycopg2.Binary(emb_blob) if emb_blob else None, i)
                )
            except Exception as e:
                print(f"[FOTO] {e}")

    registrar_auditoria(data.get("usuario", "?"), "ATUALIZACAO", rid, data.get("nome", ""))
    return jsonify({"ok": True})

@app.route("/api/registros/<int:rid>", methods=["DELETE"])
def excluir_registro(rid):
    execute("DELETE FROM registros WHERE id = %s", (rid,))
    registrar_auditoria("?", "EXCLUSAO", rid)
    return jsonify({"ok": True})

# ============================================================
# ROTAS — BUSCA POR IMAGEM
# ============================================================
@app.route("/api/busca-facial", methods=["POST"])
def busca_facial():
    if not FACE_OK:
        return jsonify({
            "erro": "HF_TOKEN nao configurado",
            "matches": [],
            "disponivel": False
        }), 503

    data = request.get_json() or {}
    img_b64 = data.get("imagem")
    if not img_b64:
        return jsonify({"erro": "Imagem nao fornecida", "matches": []}), 400

    try:
        img_bytes = _b64_to_bytes(img_b64)
        enc_entrada = gerar_embedding(img_bytes)
    except Exception as e:
        return jsonify({"erro": f"Erro processando imagem: {e}", "matches": []}), 400

    if enc_entrada is None:
        return jsonify({
            "erro": "Nao foi possivel gerar embedding. Veja /api/debug-hf para diagnostico.",
            "matches": [],
            "disponivel": True
        }), 400

    enc_entrada_norm = normalizar_embedding(enc_entrada)

    fotos = query_all("""
        SELECT f.registro_id, f.embedding, r.nome
        FROM fotos f
        JOIN registros r ON r.id = f.registro_id
        WHERE f.embedding IS NOT NULL
    """)

    matches = []
    for f in fotos:
        try:
            emb_db = blob_para_embedding(f["embedding"])
            if emb_db is None or len(emb_db) != len(enc_entrada):
                continue
            emb_db_norm = normalizar_embedding(emb_db)
            cos_sim = float(np.dot(enc_entrada_norm, emb_db_norm))
            dist = 1.0 - cos_sim
            if dist <= FACE_THRESHOLD:
                matches.append({
                    "registro_id": f["registro_id"],
                    "nome": f["nome"],
                    "distancia": dist,
                    "similaridade": max(0.0, cos_sim)
                })
        except Exception as e:
            print(f"[MATCH] {e}")
            continue

    por_reg = {}
    for m in matches:
        rid = m["registro_id"]
        if rid not in por_reg or m["similaridade"] > por_reg[rid]["similaridade"]:
            por_reg[rid] = m

    ordenados = sorted(por_reg.values(), key=lambda x: -x["similaridade"])[:3]
    registrar_auditoria("?", "BUSCA_IMAGEM", detalhes=f"{len(ordenados)} match(es)")
    return jsonify({"matches": ordenados, "disponivel": True})

# ============================================================
# ROTAS — AUDITORIA
# ============================================================
@app.route("/api/auditoria", methods=["GET"])
def listar_auditoria():
    limite = int(request.args.get("limite", 500))
    rows = query_all("SELECT * FROM auditoria ORDER BY id DESC LIMIT %s", (limite,))
    return jsonify(rows)

# ============================================================
# HELPERS
# ============================================================
def _row_registro(row):
    d = dict(row)
    if d.get("data_cadastro"):
        d["data_cadastro"] = d["data_cadastro"].strftime("%Y-%m-%d %H:%M:%S")
    d["tatuagens"] = [t.strip() for t in (d.get("tatuagem") or "").split(";") if t.strip()]
    d["sinais"] = [s.strip() for s in (d.get("sinais") or "").split(";") if s.strip()]
    return d

def _b64(data):
    if isinstance(data, memoryview):
        data = bytes(data)
    return "data:image/png;base64," + base64.b64encode(data).decode()

def _b64_to_bytes(b64):
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    return base64.b64decode(b64)

# ============================================================
# BOOT
# ============================================================
if __name__ == "__main__":
    print("=" * 60)
    print("  Sistema de Procura API v3.4")
    print(f"  bcrypt:            {'OK' if BCRYPT_OK else 'AUSENTE'}")
    print(f"  Hugging Face:      {'OK' if FACE_OK else 'AUSENTE (HF_TOKEN vazio)'}")
    print(f"  Modelos:           {HF_MODELS}")
    print(f"  Porta:             {PORT}")
    print("=" * 60)
    app.run(host="0.0.0.0", port=PORT, debug=False)
