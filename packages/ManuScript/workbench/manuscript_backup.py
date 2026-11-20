"""Local, immutable copies of committed manuscript versions."""

import errno
import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path
from urllib.parse import unquote

import document_figures
import manuscript_document


SCHEMA = '''
create table if not exists manuscript_backups (
    project text not null, version text not null, digest text not null,
    token text not null, written text, location text,
    primary key(project, version)
);
'''


def folder(db, project):
    if db.execute("select 1 from sqlite_master where name='lx_folder'").fetchone():
        row = db.execute('select path from lx_folder where project=?', (project,)).fetchone()
        if row:
            return Path(row[0]) / '正文备份' / ('ManuScript-' + project)


def source_files(blocks):
    extensions = {'md': 'md', 'tex': 'tex'}
    if len({b['format'] for b in blocks}) <= 1:
        doc = manuscript_document.read(blocks)
        return {'manuscript.' + extensions.get(doc['format'], 'txt'): doc['text'].encode('utf-8')}
    # Older projects can contain a mixture of Markdown and LaTeX blocks.
    return {
        f"manuscript-{i+1:03}.{extensions.get(b['format'], 'txt')}":
            (manuscript_document.prefix(b, blocks, i) + b['text']).encode('utf-8')
        for i, b in enumerate(blocks)
    }


def enqueue(db, project):
    from project_store import uid

    if not folder(db, project['id']):
        return
    version = project['versions'][-1]
    latest = db.execute(
        'select digest from manuscript_backups where project=? order by rowid desc limit 1',
        (project['id'],),
    ).fetchone()
    if not latest and not project['blocks']:
        return
    digest = hashlib.sha256()
    for name, data in source_files(version['blocks']).items():
        digest.update(name.encode() + b'\0' + hashlib.sha256(data).digest())
    fingerprint = digest.hexdigest()
    if not latest or latest[0] != fingerprint:
        db.execute('insert or ignore into manuscript_backups values (?,?,?,?,null,null)',
                   (project['id'], version['id'], fingerprint, uid()[:10]))


def bundle(db, project, version):
    from project_store import bibliography, blob
    from scholar import bib_data

    files = source_files(version['blocks'])
    resources, _ = document_figures.catalog(project, version)
    pages = {}
    for name, raw in list(files.items()):
        if not name.endswith('.md'):
            continue
        text = document_figures.CODE.sub('', raw.decode('utf-8'))
        for pattern in (document_figures.IMAGE_LINK, document_figures.LINK_DEFINITION):
            for match in pattern.finditer(text):
                key = document_figures.path_from(match['dest'])
                if key not in resources:
                    continue
                path = unquote(key)
                relative = Path(path)
                if relative.parent == Path('figures') and relative.name != '..' and path not in files:
                    files[path] = document_figures.pixels(db, version, resources, key, blob, pages)
    bib = bib_data(version['references']) if version.get('references') else bibliography(db, project, version)
    if bib:
        files['references.bib'] = bib
    return files


def sync_dir(path):
    if os.name != 'nt':
        fd = os.open(path, os.O_RDONLY)
        try:
            os.fsync(fd)
        except OSError as error:
            if error.errno not in (errno.EINVAL, errno.ENOTSUP):
                raise
        finally:
            os.close(fd)


def unchanged(path, files):
    return not path.is_symlink() and all(
        (path / name).resolve() == path / name and (path / name).is_file()
        and (path / name).read_bytes() == data for name, data in files.items()
    )


def publish(root, version, token, files):
    from project_store import uid

    project_folder = root.parent.parent
    if not project_folder.is_dir() or root.resolve() != root:
        raise ValueError('项目文件夹已移动、不可用或指向其他位置')
    root.parent.mkdir(mode=0o700, exist_ok=True)
    root.mkdir(mode=0o700, exist_ok=True)
    sync_dir(root.parent.parent)
    sync_dir(root.parent)
    stem = f"v{int(version[1:]):06}-{token}"
    # A crash after the rename may leave a full copy with no database receipt.
    for previous in root.glob(stem + '*'):
        if unchanged(previous, files):
            sync_dir(root)
            return previous
    target = root / stem
    while target.exists() or target.is_symlink():
        target = root / (stem + '-' + uid()[:10])
    staging = Path(tempfile.mkdtemp(prefix='.writing-', dir=root))
    try:
        for name, data in files.items():
            dest = staging / name
            dest.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with dest.open('xb') as stream:
                stream.write(data)
                stream.flush()
                dest.chmod(0o400)
                os.fsync(stream.fileno())
        for path, _, _ in os.walk(staging, topdown=False):
            path = Path(path)
            if os.name != 'nt':
                path.chmod(0o500)
            sync_dir(path)
        staging.rename(target)
        sync_dir(root)
        return target
    finally:
        if staging.exists():
            for path, _, names in os.walk(staging):
                Path(path).chmod(0o700)
                for name in names:
                    (Path(path) / name).chmod(0o600)
            shutil.rmtree(staging)


def flush(db, project):
    from project_store import now

    root = folder(db, project)
    if not root:
        return {'state': 'unbound'}
    status = {'state': 'empty', 'folder': str(root)}
    latest = db.execute(
        'select version,location,written from manuscript_backups where project=? and written is not null order by rowid desc limit 1',
        (project,),
    ).fetchone()
    if latest:
        status.update(state='saved', version=latest[0], path=latest[1], time=latest[2])
    pending = db.execute(
        'select rowid,version,token from manuscript_backups where project=? and written is null order by rowid',
        (project,),
    ).fetchall()
    if pending:
        p = json.loads(db.execute('select body from projects where id=?', (project,)).fetchone()[0])
        versions = {v['id']: v for v in p['versions']}
        for job, version, token in pending:
            try:
                dest = publish(root, version, token, bundle(db, p, versions[version]))
            except (OSError, ValueError, KeyError, RuntimeError) as error:
                status.update(state='pending', error=str(error))
            else:
                time = now()
                db.execute('update manuscript_backups set written=?,location=? where rowid=?', (time, str(dest), job))
                if not latest or int(version[1:]) > int(latest[0][1:]):
                    status.update(version=version, path=str(dest), time=time)
                if status['state'] != 'pending':
                    status['state'] = 'saved'
    return status
