import ctypes
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from ctypes import wintypes

PROJECT_REF = 'mecurjodhtxjwtpavrcv'
BASE_URL = f'https://{PROJECT_REF}.supabase.co'
CREDENTIAL_TARGET = 'turnik-doma/supabase-secret'


class CREDENTIAL(ctypes.Structure):
    _fields_ = [
        ('Flags', wintypes.DWORD), ('Type', wintypes.DWORD),
        ('TargetName', wintypes.LPWSTR), ('Comment', wintypes.LPWSTR),
        ('LastWritten', wintypes.FILETIME), ('CredentialBlobSize', wintypes.DWORD),
        ('CredentialBlob', ctypes.POINTER(ctypes.c_byte)), ('Persist', wintypes.DWORD),
        ('AttributeCount', wintypes.DWORD), ('Attributes', ctypes.c_void_p),
        ('TargetAlias', wintypes.LPWSTR), ('UserName', wintypes.LPWSTR),
    ]


def save_secret(value):
    if os.name != 'nt':
        raise RuntimeError('Сохранение ключа настроено только в связке ключей Windows')
    blob = value.encode('utf-16-le')
    buffer = (ctypes.c_byte * len(blob)).from_buffer_copy(blob)
    credential = CREDENTIAL(
        Flags=0, Type=1, TargetName=CREDENTIAL_TARGET, Comment=None,
        CredentialBlobSize=len(blob), CredentialBlob=buffer, Persist=2,
        AttributeCount=0, Attributes=None, TargetAlias=None, UserName='supabase',
    )
    if not ctypes.windll.advapi32.CredWriteW(ctypes.byref(credential), 0):
        raise ctypes.WinError()


def get_secret():
    if os.name != 'nt':
        value = os.environ.get('WORKOUT_SUPABASE_SECRET')
        if value:
            return value
        raise RuntimeError('Задайте WORKOUT_SUPABASE_SECRET')
    credential = ctypes.POINTER(CREDENTIAL)()
    if not ctypes.windll.advapi32.CredReadW(CREDENTIAL_TARGET, 1, 0, ctypes.byref(credential)):
        raise ctypes.WinError()
    try:
        item = credential.contents
        return ctypes.string_at(item.CredentialBlob, item.CredentialBlobSize).decode('utf-16-le')
    finally:
        ctypes.windll.advapi32.CredFree(credential)


def configure():
    npx = shutil.which('npx')
    if not npx:
        raise RuntimeError('Не найден npx')
    result = subprocess.run(
        [npx, '--yes', 'supabase@latest', 'projects', 'api-keys', f'--remote={PROJECT_REF}', '--reveal', '--output', 'json'],
        capture_output=True, text=True, encoding='utf-8', errors='replace', check=True,
    )
    output = result.stdout
    keys = json.loads(output[output.index('['):output.rindex(']') + 1])
    secret = next(item['api_key'] for item in keys if item.get('type') == 'secret')
    save_secret(secret)
    print('Секретный ключ сохранён в связке ключей Windows.')


def api_request(path, method='GET', body=None):
    secret = get_secret()
    request = urllib.request.Request(
        BASE_URL + path,
        method=method,
        data=json.dumps(body).encode('utf-8') if body is not None else None,
        headers={
            'apikey': secret,
            'Authorization': f'Bearer {secret}',
            'Content-Type': 'application/json',
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            text = response.read().decode('utf-8')
            return json.loads(text) if text else None
    except urllib.error.HTTPError as error:
        detail = error.read().decode('utf-8', errors='replace')[:300]
        raise RuntimeError(f'Supabase HTTP {error.code}: {detail}') from error


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else ''
    if command == 'configure':
        configure()
        return
    if command == 'export' and len(sys.argv) == 3:
        rows = api_request('/rest/v1/workout_documents?select=user_id,path,data,updated_at')
        with open(sys.argv[2], 'w', encoding='utf-8') as output:
            json.dump({'docs': rows}, output, ensure_ascii=False, indent=2)
        print(f'Документов: {len(rows)}; учётных записей: {len(set(row["user_id"] for row in rows))}. Файл: {sys.argv[2]}')
        return
    if command == 'cleanup-user' and len(sys.argv) == 3:
        user_id = sys.argv[2]
        api_request(f'/rest/v1/workout_documents?user_id=eq.{user_id}', method='DELETE')
        api_request(f'/auth/v1/admin/users/{user_id}', method='DELETE')
        print('Тестовая учётная запись и её документы удалены.')
        return
    raise SystemExit('Команды: configure | export <файл> | cleanup-user <user_id>')


if __name__ == '__main__':
    main()
