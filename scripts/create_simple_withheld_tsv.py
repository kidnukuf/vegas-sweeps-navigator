from pathlib import Path
import csv

root=Path('/home/ubuntu/vegas-sweeps-navigator')
src=root/'references/withheld-hotel-data-for-google-sheets.tsv'
out=root/'references/withheld-row-name-confirmation.tsv'
with src.open(newline='',encoding='utf-8') as f:
    rows=list(csv.DictReader(f,delimiter='\t'))
with out.open('w',newline='',encoding='utf-8') as f:
    w=csv.writer(f,delimiter='\t',lineterminator='\n')
    w.writerow(['Row Data','Name','Conf #'])
    for r in rows:
        w.writerow([r['Source Row'],r['Name'],r['Confirmation']])
with out.open(newline='',encoding='utf-8') as f:
    check=list(csv.reader(f,delimiter='\t'))
assert len(check)==148
assert all(len(r)==3 for r in check)
print(out)
print('data_rows',len(check)-1,'columns',len(check[0]))
print('first_data',check[1])
print('last_data',check[-1])
