"""Read original insurer PDFs, cross-check Excel, export only public premium data.

Usage: python extract-hospital-rates.py VIP.pdf MCVIP.pdf workbook.xlsx
Source files are never edited. PDF layouts are deliberately validated strictly.
"""
import hashlib
import json
import re
import sys
from pathlib import Path
import pdfplumber
import openpyxl

vip_path, mc_path, excel_path = map(Path, sys.argv[1:])
vip, mc = {}, {}
with pdfplumber.open(vip_path) as pdf:
    assert len(pdf.pages) == 13 and 'October 2025' in pdf.pages[0].extract_text()
    for page_index in range(1, 9):
        currency = 'HKD' if page_index <= 4 else 'USD'
        excess = (page_index - 1) % 4
        for line in pdf.pages[page_index].extract_text().splitlines():
            tokens = line.split()
            if len(tokens) not in (4, 8) or not re.fullmatch(r'\d+[+*]*', tokens[0]):
                continue
            if not all(re.fullmatch(r'[\d,]+\.\d{2}', t) for t in tokens[1::2]):
                continue
            half = len(tokens) // 2
            for area, start in [('asia', 0), ('world', half)]:
                for i in range(start, start + half, 2):
                    age = int(re.sub(r'\D', '', tokens[i]))
                    vip[f'{currency}-{area}-{excess}-{age}'] = float(tokens[i + 1].replace(',', ''))
assert len(vip) == 16 * 121, len(vip)
with pdfplumber.open(mc_path) as pdf:
    assert len(pdf.pages) == 9 and 'July 2024' in pdf.pages[0].extract_text()
    for page in pdf.pages[1:4]:
        for line in page.extract_text().splitlines():
            tokens = line.split()
            if len(tokens) != 8 or not re.fullmatch(r'\d+(?:-\d+)?\*?', tokens[0]):
                continue
            if not all(re.fullmatch(r'[\d,]+\.\d', t) for t in tokens[1:]):
                continue
            ages = tokens[0].replace('*', '').split('-')
            for age in range(int(ages[0]), int(ages[-1]) + 1):
                for key, value in zip(['1-1', '2-0', '2-1', '3-0', '3-1', '4-0', '4-1'], tokens[1:]):
                    mc[f'{key}-{age}'] = float(value.replace(',', ''))
    for line in pdf.pages[4].extract_text().splitlines():
        tokens = line.split()
        if len(tokens) == 4 and re.fullmatch(r'\d+\*?', tokens[0]) and re.fullmatch(r'[\d,]+\.\d', tokens[1]):
            for i in (0, 2):
                mc[f'outpatient-{int(tokens[i].replace("*", ""))}'] = float(tokens[i + 1].replace(',', ''))
assert len(mc) == 800, len(mc)
w = openpyxl.load_workbook(excel_path, read_only=True, data_only=True)
mismatches = []
checks = 0
for sheet, start, end in [('data', 212, 227), ('data2', 221, 228)]:
    for row in w[sheet].iter_rows(min_row=4, max_row=124, max_col=end):
        age = row[0].value
        if not isinstance(age, int) or age < 1 or age > (121 if sheet == 'data' else 100):
            continue
        for col in range(start, end + 1):
            if sheet == 'data':
                index = col - 212
                key = f'{"HKD" if index % 8 < 4 else "USD"}-{"asia" if index < 8 else "world"}-{index % 4}-{age}'
                expected = vip[key]
            else:
                key = (['1-1', '2-0', '2-1', '3-0', '3-1', '4-0', '4-1', 'outpatient'][col - 221]) + f'-{age}'
                expected = mc[key]
            actual = row[col - 1].value
            checks += 1
            if not isinstance(actual, (int, float)) or abs(actual - expected) > .001:
                mismatches.append({'sheet': sheet, 'age': age, 'column': col, 'excel': actual, 'pdf': expected})
result = {'vip': vip, 'mcvip': mc, 'sources': {
    'VIP': {'version': '2025-10', 'sha256': hashlib.sha256(vip_path.read_bytes()).hexdigest(), 'url': 'https://www.prudential.com.hk/tc/.galleries/pdf/brochure/pruhealth-vhis-vip-premium-table.pdf'},
    'MCVIP': {'version': '2024-07', 'sha256': hashlib.sha256(mc_path.read_bytes()).hexdigest(), 'url': 'https://www.dropbox.com/scl/fi/2i4o5j6bp6b7egtmzhemk/MCVIP_Premium-Table_AGY_TCEN_Jul24R.pdf?rlkey=ii80cdf5a566416vabqpk05ue&dl=0'}},
    'audit': {'excelCompared': checks, 'mismatches': mismatches}}
Path(__file__).resolve().parents[1].joinpath('src/lib/hospitalRates.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
print(json.dumps(result['audit'], ensure_ascii=False))
