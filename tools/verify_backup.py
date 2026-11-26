"""Checks an OMECOnnect nightly backup file (restore drill).

Download a backup first: Supabase > Storage > backups > YYYY-MM-DD > omeconnect-YYYY-MM-DD.json.gz
Then run:
    python tools/verify_backup.py path/to/omeconnect-YYYY-MM-DD.json.gz

It prints the row count of every table and checks that the data hangs together
(every bill belongs to an account, every payment to an account, the rate schedule
is present ...). Exit code 0 = the backup is usable; 1 = something is missing.
The file contains customer data: keep it private and delete it after the drill.
"""
import gzip
import json
import sys

REQUIRED = [
    'users', 'customer_accounts', 'electricity_bills', 'payments', 'meter_readings',
    'account_verification_requests', 'complaints', 'complaint_status_history',
    'announcements', 'admin_accounts', 'audit_logs', 'service_areas', 'app_settings',
    'electricity_rates', 'notifications',
]


def main(path):
    with gzip.open(path, 'rt', encoding='utf-8') as handle:
        backup = json.load(handle)
    data = backup.get('data', {})
    problems = []

    print(f"Backup created: {backup.get('created_at', 'unknown')}")
    print(f"{'Table':32} Rows")
    for table in REQUIRED:
        rows = data.get(table)
        if rows is None:
            problems.append(f'table "{table}" is missing')
            print(f'{table:32} MISSING')
        else:
            print(f'{table:32} {len(rows)}')
            expected = backup.get('counts', {}).get(table)
            if expected is not None and expected != len(rows):
                problems.append(f'{table}: header says {expected} rows but file has {len(rows)}')

    accounts = {a.get('id') for a in data.get('customer_accounts', [])}
    users = {u.get('id') for u in data.get('users', [])}
    orphan_bills = [b for b in data.get('electricity_bills', []) if b.get('customer_account_id') not in accounts]
    orphan_payments = [p for p in data.get('payments', []) if p.get('customer_account_id') not in accounts]
    orphan_concerns = [c for c in data.get('complaints', []) if c.get('user_id') and c.get('user_id') not in users]
    if orphan_bills:
        problems.append(f'{len(orphan_bills)} bill(s) point to an account that is not in the backup')
    if orphan_payments:
        problems.append(f'{len(orphan_payments)} payment(s) point to an account that is not in the backup')
    if orphan_concerns:
        problems.append(f'{len(orphan_concerns)} concern(s) point to a user that is not in the backup')
    if not data.get('electricity_rates'):
        problems.append('no electricity rate schedule: bills could not be recomputed after a restore')
    if not data.get('service_areas'):
        problems.append('no service areas (municipalities/barangays)')

    print()
    if problems:
        print('PROBLEMS FOUND:')
        for problem in problems:
            print(' -', problem)
        return 1
    print('OK: the backup is complete and consistent.')
    return 0


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Usage: python tools/verify_backup.py omeconnect-YYYY-MM-DD.json.gz')
    sys.exit(main(sys.argv[1]))
