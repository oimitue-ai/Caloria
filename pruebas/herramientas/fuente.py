#!/usr/bin/env python3
"""Valores oficiales de la fuente cruda (datos/crudos) para comparar con la app.

Uso:  python3 -I pruebas/herramientas/fuente.py usda_sr_legacy:173944 off:7501055300075 usda_branded:2345678 ...
Imprime JSON por línea: {id, descripcion, kcal, proteina, carbohidratos, grasa, porciones|serving, ...}
USDA: se lee el JSON oficial dentro del zip en streaming (`unzip -p`, un objeto por línea) y se busca "fdcId":N.
OFF: volcado TSV oficial filtrado a México (gzip), columna code.
"""
import gzip, json, subprocess, sys, os, glob, csv

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CRUDOS = os.path.join(RAIZ, 'datos', 'crudos')
PATRON = {
    'usda_sr_legacy': 'FoodData_Central_sr_legacy_food_json_*.zip',
    'usda_foundation': 'FoodData_Central_foundation_food_json_*.zip',
    'usda_fndds': 'FoodData_Central_survey_food_json_*.zip',
    'usda_branded': 'FoodData_Central_branded_food_json_*.zip',
}
# 1008 = Energy (kcal); 2047/2048 = Energy (Atwater general/specific) en Foundation
NUT = {1003: 'proteina', 1004: 'grasa', 1005: 'carbohidratos', 1008: 'kcal', 2047: 'kcal_atwater_general',
       2048: 'kcal_atwater_especifico', 1079: 'fibra', 1093: 'sodio', 2000: 'azucares', 1258: 'grasaSaturada'}


def usda(fuente, ids):
    z = sorted(glob.glob(os.path.join(CRUDOS, 'usda', PATRON[fuente])))[-1]
    pendientes = {f'"fdcId":{i},' for i in ids}
    out = {}
    p = subprocess.Popen(['unzip', '-p', z], stdout=subprocess.PIPE)
    for linea in p.stdout:
        if b'"fdcId"' not in linea:
            continue
        s = linea.decode('utf-8')
        hit = next((k for k in pendientes if k in s), None)
        if not hit:
            continue
        o = json.loads(s.strip().rstrip(','))
        if f'"fdcId":{o["fdcId"]},' != hit:
            continue  # el patrón apareció en otro campo
        pendientes.discard(hit)
        r = {'id': f'{fuente}:{o["fdcId"]}', 'descripcion': o.get('description')}
        for n in o.get('foodNutrients', []):
            k = NUT.get(n.get('nutrient', {}).get('id'))
            if k and 'amount' in n:
                r[k] = n['amount']
        if fuente == 'usda_branded':
            r.update({k: o.get(k) for k in ('brandOwner', 'brandName', 'gtinUpc', 'servingSize', 'servingSizeUnit', 'householdServingFullText')})
        else:
            r['porciones'] = [(fp.get('portionDescription') or ' '.join(str(x) for x in (fp.get('amount'), (fp.get('measureUnit') or {}).get('name'), fp.get('modifier')) if x),
                               fp.get('gramWeight')) for fp in o.get('foodPortions', [])]
        out[r['id']] = r
        if not pendientes:
            break
    p.kill()
    return out


def off(codigos):
    out = {}
    pend = set(codigos)
    with gzip.open(os.path.join(CRUDOS, 'off', 'off_mexico.tsv.gz'), 'rt', encoding='utf-8', newline='') as f:
        lector = csv.reader(f, delimiter='\t', quoting=csv.QUOTE_NONE)
        cab = next(lector)
        ix = {c: i for i, c in enumerate(cab)}
        for fila in lector:
            if len(fila) <= ix['code']:
                continue
            c = fila[ix['code']]
            c13 = c.zfill(13)
            if c in pend or c13 in pend:
                g = lambda k: fila[ix[k]] if ix.get(k) is not None and ix[k] < len(fila) else None
                out['off:' + c13] = {'id': 'off:' + c13, 'code': c, 'descripcion': g('product_name'), 'marca': g('brands'),
                                     'kcal': g('energy-kcal_100g'), 'proteina': g('proteins_100g'),
                                     'carbohidratos': g('carbohydrates_100g'), 'grasa': g('fat_100g'),
                                     'quantity': g('quantity'), 'serving_size': g('serving_size')}
                pend.discard(c); pend.discard(c13)
                if not pend:
                    break
    return out


def main(ids):
    por = {}
    for i in ids:
        f, _, o = i.partition(':')
        por.setdefault(f, []).append(o)
    res = {}
    for f, lista in por.items():
        if f == 'off':
            res.update(off(lista))
        elif f in PATRON:
            res.update(usda(f, lista))
    for i in ids:
        f, _, o = i.partition(':')
        k = i if f != 'off' else 'off:' + o.zfill(13)
        print(json.dumps(res.get(k, {'id': i, 'error': 'no encontrado'}), ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1:])
