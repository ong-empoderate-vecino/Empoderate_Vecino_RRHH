import csv

CAND = {
  'dep':  ['department', 'departamento', 'dep', 'region', 'region_name', 'nombre_departamento'],
  'prov': ['province', 'provincia', 'prov', 'nombre_provincia'],
  'dist': ['district', 'distrito', 'dist', 'nombre_distrito'],
  'code': ['inei', 'reniec', 'ubigeo', 'codigo_ubigeo', 'cod_ubigeo', 'code', 'ubigeo_code', 'codigo', 'id_ubigeo']
}

def pick(fieldnames, cands):
    low = {f.strip().lower(): f for f in fieldnames}
    for c in cands:
        if c in low:
            return low[c]
    return None

with open('ubigeo_peru.csv', 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    print('Columnas detectadas en el CSV:', reader.fieldnames)
    m = {k: pick(reader.fieldnames, v) for k, v in CAND.items()}
    print('Mapeo usado:', m)
    if not all(m.values()):
        raise SystemExit('FALTA detectar alguna columna. Copiame la linea "Columnas detectadas" y ajusto el mapeo.')
    rows = list(reader)

values = []
for row in rows:
    dep  = (row[m['dep']]  or '').strip().replace("'", "''")
    prov = (row[m['prov']] or '').strip().replace("'", "''")
    dist = (row[m['dist']] or '').strip().replace("'", "''")
    code = (row[m['code']] or '').strip().replace("'", "''")
    if not dep or not prov or not dist:
        continue
    values.append(f"('{dep}', '{prov}', '{dist}', '{code}')")

sql = ("INSERT INTO ubigeo (departamento, provincia, distrito, codigo_ubigeo) VALUES\n"
       + ',\n'.join(values)
       + "\nON CONFLICT (codigo_ubigeo) DO NOTHING;")

with open('ubigeo_insert.sql', 'w', encoding='utf-8') as f:
    f.write(sql)

print(f'Generado ubigeo_insert.sql con {len(values)} distritos')