#!/bin/bash
# T9 adjudication probes against the LOCAL P47 stack. Synthetic users only.
BE=http://127.0.0.1:2353
T1=$(./login.sh demo@cera.io 'Test1234!')
T2=$(./login.sh p47-reviewer2@example.invalid 'P47Stage1!Rev2x')
T3=$(./login.sh p47-adjudicator3@example.invalid 'P47Stage1!Adj3x')
post () { # $1=token $2=eventId $3=json
  curl -s -w "\n[HTTP %{http_code}]\n" -X POST "$BE/api/v1/ai/events/$2/triage" \
    -H "Authorization: Bearer $1" -H 'content-type: application/json' -d "$3" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const L=s.trim().split('\n');const code=L.pop();try{const j=JSON.parse(L.join('\n'));console.log((j.triage?JSON.stringify(j.triage):JSON.stringify(j.message||j))+' '+code)}catch(e){console.log(s.trim())}})"
}
DISPUTE=$1
AGREE=$2
echo "=== DISPUTE PATH on $DISPUTE ==="
echo -n "1. demo -> true_positive         : "; post "$T1" "$DISPUTE" '{"classification":"true_positive"}'
echo -n "2. reviewer2 -> false_positive   : "; post "$T2" "$DISPUTE" '{"classification":"false_positive"}'
echo -n "3. reviewer2 SELF-adjudicates    : "; post "$T2" "$DISPUTE" '{"classification":"duplicate"}'
echo -n "4. demo (labeler 1) adjudicates  : "; post "$T1" "$DISPUTE" '{"classification":"duplicate"}'
echo -n "5. adjudicator3 -> reviewed_unknown: "; post "$T3" "$DISPUTE" '{"classification":"reviewed_unknown"}'
echo
echo "=== NEGATIVE CONTROL / benign twin: two reviewers who AGREE, on $AGREE ==="
echo -n "1. demo -> true_positive         : "; post "$T1" "$AGREE" '{"classification":"true_positive"}'
echo -n "2. reviewer2 -> true_positive    : "; post "$T2" "$AGREE" '{"classification":"true_positive"}'
