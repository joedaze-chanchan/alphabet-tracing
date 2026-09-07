# 영어 배우기 (Alphabet Tracing)

모바일 브라우저에서 혼자 영어를 익히는 교육 웹앱. 빌드 도구 없이 정적 파일만으로 동작한다.

메뉴: 1 알파벳 따라쓰기(A~Z) · 2 단어 따라쓰기(준비 중) · 3 게임하기(외계 비행선 격추)

배포: https://joedaze-chanchan.github.io/alphabet-tracing/

## 실행
```
python -m http.server 8766
```
후 폰 또는 브라우저에서 `http://localhost:8766` 접속. (ES 모듈을 쓰므로 file:// 로는 열리지 않는다.)

## 테스트
```
npm test
```

## 구조
| 파일 | 역할 |
|---|---|
| `index.html`, `style.css` | 홈/연습 화면 레이아웃 |
| `letters.js` | 글자별 획 데이터(100×100 좌표) + 한글 읽기·파닉스 소리·예시 단어 |
| `tracer.js` | 획 판정 엔진 (순수 함수) |
| `app.js` | 화면 전환, 캔버스 렌더링, 시범 애니메이션, 터치 처리 |
| `progress.js` | 학습 기록·설정·게임 최고 점수 저장 (localStorage) |
| `game.js`, `pad.js`, `words.js` | 게임 진행·그리기, 쓰기 판, 단어 목록·난이도 |
| `profiles.js` | 참여자(캐릭터) 목록, 참여자별 저장소, 이어하기 기록 |
| `tests/tracer.test.js` | 판정 엔진·획 데이터 테스트 |
| `audio/*.mp3` | 글자별 발음 (tools/make_audio.py로 생성, edge-tts) |

설계 문서: `docs/superpowers/specs/2026-09-07-alphabet-tracing-design.md`

## 글자 추가
`letters.js`의 `LETTERS`에 획 목록을 추가하면 홈 화면과 판정에 자동 반영된다.
`joins: [k]`를 넣으면 k번 획에서 손을 떼지 않고 k+1번 획으로 이어 써도 정답 처리된다 (예: B의 굽은 획).
