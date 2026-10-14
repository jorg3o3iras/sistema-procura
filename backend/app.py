# -*- coding: utf-8 -*-
"""
Sistema de Procura v3.3 - Backend Flask + Neon PostgreSQL
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
PORT = int(os.environ.get("PORT", 5000))

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL nao configurada")

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
# ROTAS
# ============================================================
@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "app": "Sistema de Procura API",
        "version": "3.3",
        "face_recognition": False,
        "bcrypt": BCRYPT_OK,
        "status": "online"
    })

@app.route("/api/health", methods=["GET"])
def health():
    try:
        query_one("SELECT 1 as ok")
        return jsonify({"db": "ok", "status": "healthy"})
    except Exception as e:
        return jsonify({"db": "error", "detalhes": str(e)}), 500

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
            execute(
                "INSERT INTO fotos (registro_id, imagem, ordem, data_cadastro) "
                "VALUES (%s, %s, %s, NOW())",
                (rid, psycopg2.Binary(img_bytes), i)
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
                execute(
                    "INSERT INTO fotos (registro_id, imagem, ordem, data_cadastro) "
                    "VALUES (%s, %s, %s, NOW())",
                    (rid, psycopg2.Binary(img_bytes), i)
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

@app.route("/api/busca-facial", methods=["POST"])
def busca_facial():
    return jsonify({"erro": "Busca facial nao disponivel neste plano", "matches": []}), 503

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
    app.run(host="0.0.0.0", port=PORT, debug=False)
