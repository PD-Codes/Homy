"""Tests for Zabbix integration API calls (Zabbix 7 compatible)."""

import unittest
from unittest.mock import MagicMock, patch

from homy.integrations.zabbix import zabbix as zabbix_mod


class TestZabbixIntegration(unittest.TestCase):
    def test_fetch_problems_does_not_use_select_hosts_on_problem_get(self):
        config = {
            'server_url': 'http://192.168.178.104/zabbix',
            'api_token': 'test-token',
            'verify_ssl': 'Nein',
        }
        problem_result = [
            {
                'eventid': '101',
                'objectid': '55',
                'object': '0',
                'name': 'High CPU',
                'severity': '4',
                'clock': '1717000000',
                'opdata': '',
            },
        ]
        event_result = [
            {
                'eventid': '101',
                'hosts': [{'hostid': '1', 'host': 'zabbix-server', 'name': 'Zabbix server'}],
            },
        ]

        def fake_post(url, **kwargs):
            payload = kwargs.get('json') or {}
            method = payload.get('method')
            resp = MagicMock()
            resp.raise_for_status = MagicMock()
            if method == 'problem.get':
                resp.json.return_value = {'jsonrpc': '2.0', 'result': problem_result, 'id': 1}
            elif method == 'event.get':
                resp.json.return_value = {'jsonrpc': '2.0', 'result': event_result, 'id': 1}
            else:
                resp.json.return_value = {'jsonrpc': '2.0', 'result': [], 'id': 1}
            return resp

        with patch.object(zabbix_mod.requests, 'post', side_effect=fake_post) as mock_post:
            problems = zabbix_mod.fetch_problems(config, limit=5)

        problem_calls = [
            c for c in mock_post.call_args_list
            if (c.kwargs.get('json') or {}).get('method') == 'problem.get'
        ]
        self.assertEqual(len(problem_calls), 1)
        params = problem_calls[0].kwargs['json']['params']
        self.assertNotIn('selectHosts', params)

        self.assertEqual(len(problems), 1)
        self.assertEqual(problems[0]['host'], 'Zabbix server')
        self.assertEqual(problems[0]['name'], 'High CPU')

    def test_fetch_host_status_parses_metrics_and_temperatures(self):
        config = {
            'server_url': 'http://zabbix.local/zabbix',
            'api_token': 'token',
            'verify_ssl': 'Nein',
        }
        host_result = [{'hostid': '42', 'host': 'raspberry.pi', 'name': 'Raspberry Pi'}]
        item_result = [
            {
                'itemid': '1',
                'key_': 'system.cpu.util',
                'name': 'CPU utilization',
                'lastvalue': '43.25',
                'units': '%',
            },
            {
                'itemid': '2',
                'key_': 'vm.memory.util',
                'name': 'Memory utilization',
                'lastvalue': '57.93',
                'units': '%',
            },
            {
                'itemid': '3',
                'key_': 'vfs.fs.size[/,pused]',
                'name': 'FS /: Space utilization',
                'lastvalue': '71.2',
                'units': '%',
            },
            {
                'itemid': '4',
                'key_': 'sensor.temp[core0]',
                'name': 'Temperature Sensor Core 0',
                'lastvalue': '52',
                'units': '°C',
            },
            {
                'itemid': '5',
                'key_': 'sensor.temp[core1]',
                'name': 'Temperature Sensor Core 1',
                'lastvalue': '58',
                'units': '°C',
            },
            {
                'itemid': '6',
                'key_': 'sensor.temp[temp1]',
                'name': 'Temperature Sensor temp1',
                'lastvalue': '82',
                'units': '°C',
            },
        ]

        def fake_post(url, **kwargs):
            payload = kwargs.get('json') or {}
            method = payload.get('method')
            resp = MagicMock()
            resp.raise_for_status = MagicMock()
            if method == 'host.get':
                resp.json.return_value = {'jsonrpc': '2.0', 'result': host_result, 'id': 1}
            elif method == 'item.get':
                resp.json.return_value = {'jsonrpc': '2.0', 'result': item_result, 'id': 1}
            else:
                resp.json.return_value = {'jsonrpc': '2.0', 'result': [], 'id': 1}
            return resp

        with patch.object(zabbix_mod.requests, 'post', side_effect=fake_post):
            status = zabbix_mod.fetch_host_status(config, '42', disk_mount='/')

        self.assertEqual(status['name'], 'Raspberry Pi')
        self.assertEqual(status['cpu_percent'], 43.2)
        self.assertEqual(status['memory_percent'], 57.9)
        self.assertEqual(status['disk_percent'], 71.2)
        labels = [t['label'] for t in status['temperatures']]
        self.assertEqual(labels, ['CPU 0', 'CPU 1', 'temp1'])
        self.assertEqual(status['temperatures'][0]['value'], 52.0)


if __name__ == '__main__':
    unittest.main()
