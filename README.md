# 장기요양 본인부담금 계산기 v2 (푸들 보리 · Warmpin 디자인)

마케팅지니가 보호자에게 드리는 무료 계산기예요. **등급과 이용일수만 넣으면** 한 달에 내실 금액이 바로 나와요.
2026.1.1. 국민건강보험공단 고시 기준. 홈 화면에 추가하면 앱처럼 쓸 수 있어요(PWA).

## 파일 설명
| 파일 | 하는 일 |
|---|---|
| `index.html` | 화면 내용(글자·구조). 푸들 그림도 이 안에 있어요 |
| `style.css` | Warmpin 디자인 시스템 (크림 바탕, 흰 카드, 노랑·파랑, Pretendard 글꼴, 다크 모드) |
| `anim.css` | 움직임: 푸들(눈 깜빡·귀 팔랑·콩 뛰기), 금액 반짝, 맨 아래 로고 |
| `calc.js` | 계산 (화면과 무관). **수가(금액표)는 맨 위 `DATA` 한 곳만** 고치면 돼요 |
| `faq.js` | 자주 묻는 질문 11개 (숫자는 `DATA`에서 가져와요) |
| `app.js` | 눌렀을 때 화면이 바뀌는 동작, 보내기, 음악, 홈 화면 추가 |
| `sw.js` | 인터넷 없이도 열리게 저장해 두는 파일. **고쳐서 올릴 때마다 맨 위 `VERSION` 숫자를 바꿔 주세요** |
| `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png`, `logo.png`, `og.png` | 홈 화면 앱 이름·아이콘·로고, 카톡 미리보기 그림 |
| `check-v2.mjs` | 옛 계산기와 숫자가 같은지 대조하는 검사 (`node check-v2.mjs`) |
| `dev-server.mjs`, `start-dev.bat` | 내 컴퓨터에서 미리 보는 개발 서버 (올리지 않는 파일) |

## 미리 보기
`start-dev.bat`을 더블클릭하면 크롬이 열려요. 파일을 저장하면 화면이 자동으로 새로고침돼요.

## 올릴 때 (GitHub Pages)
`dev-server.mjs`, `start-dev.bat`, `check-v2.mjs`, `README.md`를 뺀 나머지 파일을 저장소에 올려요. (`og:url`, `og:image` 주소는 `care_calculator` 기준이에요.)
