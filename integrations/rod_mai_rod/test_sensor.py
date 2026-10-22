import json
import unittest
from vps_sensor import auth_event, syn_event

class SensorTests(unittest.TestCase):
    def test_failed_and_accepted_ssh(self):
        for prefix,outcome in [('Failed password','failed'),('Accepted publickey','success')]:
            event=auth_event({'MESSAGE':f'{prefix} for test from 198.51.100.10 port 12345 ssh2'})
            self.assertEqual(event['outcome'],outcome)
            self.assertEqual(event['event_type'],'SSH_AUTH')
    def test_no_double_count_non_auth_messages(self):
        self.assertIsNone(auth_event({'MESSAGE':'Connection closed by 198.51.100.10'}))
    def test_syn_metadata(self):
        event,key=syn_event('00:00:01 eth0 In IP 8.8.8.8.32123 > 1.1.1.1.443: Flags [S], seq 1, length 0')
        self.assertEqual(event['destination_port'],443)
        self.assertEqual(event['source_ip'],'8.8.8.8')
        self.assertNotIn('payload',event)
    def test_local_and_non_syn_ignored(self):
        self.assertIsNone(syn_event('IP 127.0.0.1.10 > 127.0.0.1.20: Flags [S]'))
        self.assertIsNone(syn_event('IP 8.8.8.8.10 > 1.1.1.1.20: Flags [.]'))
    def test_ipv6(self):
        event,_=syn_event('IP6 2001:4860:4860::8888.1234 > 2606:4700:4700::1111.443: Flags [S]')
        self.assertEqual(event['destination_port'],443)

if __name__=='__main__': unittest.main()
