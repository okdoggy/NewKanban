# NewKanban · Collaborative Workspace

NewKanban은 **같은 망(LAN)에 있는 여러 PC가 하나의 서버 PC에 접속해서 같은 데이터를 함께 보는 협업용 워크스페이스**다.

기본 구성은 다음과 같다.

- **Web/App 서버**: Next.js + custom Node server + Socket.IO
- **DB 서버**: MongoDB
- **실시간 동기화**: Socket.IO
- **배포 방식**: Docker Compose

즉, 사용자 브라우저가 각자 데이터를 따로 저장하는 구조가 아니라,
**서버 PC의 MongoDB를 단일 소스 오브 트루스(single source of truth)** 로 사용한다.

---

## 1. 현재 동작 방식 요약

### 공용 데이터 저장
다음 데이터는 모두 **서버 PC의 MongoDB** 에 저장된다.

- workspace
- task
- calendar event
- my work 계산 기준 데이터
- whiteboard / notes
- notifications / join request / memberships

### 실시간 협업
같은 workspace를 보고 있는 다른 PC는 아래 변경을 **실시간으로** 본다.

- task 생성 / 수정 / 삭제
- calendar event 생성 / 수정 / 삭제
- whiteboard 저장
- 멤버 권한 변경
- workspace join 요청 / 승인 / 거절
- 알림(inbox) 갱신
- presence(누가 접속 중인지)

### workspace 단위 데이터 분리
데이터는 workspace별로 분기되어 저장된다.

- `VisualAI-Guest`의 task는 다른 workspace에 보이지 않음
- 새 workspace에서 만든 task / event / my work는 해당 workspace에만 속함
- MongoDB에도 workspace document가 분리되어 기록됨

---

## 2. 초기 상태 정책

앱을 완전히 초기화하면 다음 상태로 시작한다.

- 기본 workspace는 항상 **`VisualAI-Guest`**
- 초기 계정은 미리 심지 않음
- 사용자가 처음 Knox ID로 로그인하면 **자동 가입**
- 자동 가입한 사용자는 바로 **`VisualAI-Guest`** 로 진입
- `VisualAI-Guest`에서는 시작 권한이 모두 **Owner**
- 다른 workspace를 생성한 뒤부터는 **owner / editor / viewer** 역할 체계를 사용

### 로그인 정책
- 로그인 입력값은 이메일이 아니라 **Knox ID** 형식
  - 예: `admin.kim`
  - 예: `kildong.hong`
- 없는 Knox ID로 로그인하면 자동 가입
- 비밀번호 reset 버튼은 해당 ID의 비밀번호를 `0000`으로 초기화

---

## 3. 주요 기능

- Home / Inbox / My Work / Projects / Calendar / Collaborate
- Workspace 관리
- Workspace 멤버 / 권한 관리
- Task detail 편집
- 파일 업로드
- Calendar 관리
- Whiteboard 협업
- 실시간 presence 표시
- Inbox 기반 join request 승인 / 거절

---

## 4. 기술 스택

- Next.js 16
- React 19
- MongoDB
- Socket.IO
- shadcn/ui
- Docker / Docker Compose

---

## 5. 로컬 개발 실행 방법

### 5-1. MongoDB를 로컬에서 직접 띄우는 경우

```bash
cp .env.example .env.local
npm install
npm run dev
```

기본 접속:

```text
http://localhost:3000
```

기본 로컬 Mongo URI:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/newkanban
```

### 5-2. 개발 데이터 초기화

```bash
npm run db:reset
```

이 명령은 데이터를 비우고 아래 상태로 다시 만든다.

- workspace: `VisualAI-Guest` 1개
- user / memberships / task / calendar / notification 초기화

---

## 6. Docker Compose 실행 방법

### 6-1. 실행

```bash
docker compose up --build -d
```

### 6-2. 상태 확인

```bash
docker compose ps
```

### 6-3. 로그 확인

```bash
docker compose logs -f web
docker compose logs -f mongo
```

### 6-4. 종료

```bash
docker compose down
```

### 6-5. 데이터까지 완전 초기화

```bash
docker compose down -v
```

> `-v`를 붙이면 MongoDB 볼륨과 업로드 볼륨까지 같이 지워진다.

---

## 7. 같은 회사 망에서 접속하는 방법

Docker Compose 실행 후 서버 PC에서 3000 포트가 열려 있으면,
같은 네트워크의 다른 PC들은 아래처럼 접속하면 된다.

```text
http://<서버PC의 LAN IP>:3000
```

예시:

```text
http://192.168.0.17:3000
```

서버 PC의 LAN IP는 예를 들어 아래처럼 확인할 수 있다.

### macOS
```bash
ipconfig getifaddr en0
```

### Linux
```bash
hostname -I
```

### Windows
```powershell
ipconfig
```

---

## 8. 검증 방법

## 8-1. 기본 접속 확인

로그인 전 인증 확인:

```bash
curl http://<서버PC-IP>:3000/api/bootstrap
```

정상이라면 `401` + `authenticated:false`가 내려온다.

## 8-2. 앱 빌드/정적 검증

```bash
npm run typecheck
npm run lint
npm run build
```

## 8-3. 기본 화면 smoke 검증

```bash
npm run qa:views
```

## 8-4. LAN 실시간 협업 검증

```bash
QA_BASE_URL=http://<서버PC-IP>:3000 npm run qa:lan
```

선택적으로 테스트 계정명을 바꾸려면:

```bash
QA_ACCOUNT_ID=admin.kim QA_PASSWORD=Admin123! npm run qa:views
QA_BASE_URL=http://<서버PC-IP>:3000 QA_USER_A=admin.kim QA_USER_B=kildong.hong QA_PASSWORD=1234 npm run qa:lan
```

이 검증은 아래를 자동 확인한다.

- 두 계정이 같은 서버 주소로 로그인 가능
- 기본 workspace `VisualAI-Guest` 진입
- task 실시간 동기화
- calendar event 실시간 동기화
- 새 workspace 생성 후 데이터 분리 저장
- join 요청 / 승인 후 inbox 및 workspace 반영
- 승인된 사용자가 해당 workspace 데이터를 실제로 볼 수 있음

> `qa:lan`은 실제 MongoDB에 테스트용 user / workspace / task를 만든다.
> 운영 DB에서 실행할 때는 주의해야 한다.

## 8-5. MongoDB 직접 확인

Docker Compose 기준 예시:

```bash
docker compose exec -T mongo mongosh --quiet newkanban --eval '
const workspaces=db.workspaces.find({}, {_id:1,name:1,"tasks.title":1,"agenda.title":1}).toArray();
printjson(workspaces);
'
```

이렇게 하면 workspace별로 task / agenda가 실제로 분리 저장되는지 직접 볼 수 있다.

---

## 9. 환경 변수

기본 예시는 `.env.example` 참고.

| Variable | 설명 | 예시 |
|---|---|---|
| `PORT` | 앱 포트 | `3000` |
| `HOSTNAME` | 바인드 주소 | `0.0.0.0` |
| `MONGODB_URI` | MongoDB 연결 문자열 | `mongodb://mongo:27017/newkanban` |
| `MONGODB_DB` | DB 이름 | `newkanban` |
| `WORKSPACE_ID` | 기본 workspace id | `visualai-guest` |
| `APP_ISSUER` | MFA issuer label | `NewKanban` |
| `S3_REGION` | 선택적 S3 업로드 region | `ap-northeast-2` |
| `S3_BUCKET` | 선택적 S3 bucket | `my-kanban-files` |
| `S3_ENDPOINT` | S3-compatible endpoint | `https://s3.amazonaws.com` |
| `S3_PUBLIC_BASE_URL` | public file base url | `https://cdn.example.com` |
| `ENTERPRISE_MODE` | enterprise 배포 경고 플래그 | `false` |
| `MONGODB_LICENSE_ACKNOWLEDGED` | Mongo 라이선스 검토 확인 | `false` |
| `ICS_FEED_URLS` | 외부 읽기 전용 캘린더 피드 | `https://.../calendar.ics` |

### 참고
현재 로그인 플로우는 미리 owner 계정을 seed하지 않는다.
첫 Knox ID 로그인 시 자동 가입되는 방식이다.

---

## 10. 파일 업로드 저장 위치

기본 Docker Compose에서는 업로드 파일이 서버 쪽 볼륨에 저장된다.

- 컨테이너 내부 경로: `/app/public/uploads`
- Docker volume: `uploads_data`

즉, 파일도 각 사용자의 브라우저가 아니라 **서버 PC 저장소**를 사용한다.

S3 환경 변수를 설정하면 업로드를 S3로 보낼 수도 있다.

---

## 11. 회사에서 Proxy 설정이 필요한 경우

여기서 말하는 proxy는 보통 두 가지 케이스가 있다.

1. **회사 외부 인터넷으로 나갈 때 쓰는 outbound proxy**
2. **사내에서 서비스 앞단에 두는 reverse proxy (Nginx/Apache/LB)**

둘 다 설명한다.

### 11-1. Outbound proxy가 필요한 경우

이 경우 보통 필요한 작업은 다음이다.

- `npm install` / `docker build` 시 외부 패키지 다운로드가 proxy를 타야 함
- 선택 기능인 S3 / ICS 외부 접속도 proxy를 타야 할 수 있음

#### 쉘 환경 변수로 설정

```bash
export HTTP_PROXY=http://proxy.company.local:8080
export HTTPS_PROXY=http://proxy.company.local:8080
export NO_PROXY=localhost,127.0.0.1,mongo,.company.local
```

#### Docker Compose에 runtime proxy 넣기
필요하면 `docker-compose.yml`의 `web.environment`에 추가:

```yaml
services:
  web:
    environment:
      HTTP_PROXY: http://proxy.company.local:8080
      HTTPS_PROXY: http://proxy.company.local:8080
      NO_PROXY: localhost,127.0.0.1,mongo,.company.local
```

#### Docker build도 proxy가 필요하면
실행하는 쉘에 같은 값을 export한 뒤 build:

```bash
export HTTP_PROXY=http://proxy.company.local:8080
export HTTPS_PROXY=http://proxy.company.local:8080
export NO_PROXY=localhost,127.0.0.1,mongo,.company.local

docker compose build --no-cache
```

### 11-2. Reverse proxy를 앞단에 둘 경우

예: 회사에서 `https://kanban.company.local` 로 노출하고 싶을 때.

이 경우 중요한 포인트는 아래다.

- **3000 포트로 들어온 요청을 web 컨테이너로 전달**
- **WebSocket upgrade 허용**
- **쿠키 전달 유지**
- **`X-Forwarded-*` 헤더 보존**

#### 꼭 필요한 이유
NewKanban은 Socket.IO를 사용하므로,
reverse proxy가 **WebSocket upgrade**를 막으면 실시간 동기화가 깨진다.

#### 수정 대상
- 회사 Nginx / Apache / LB 설정
- 필요 시 `docker-compose.yml`의 port publish 방식

#### Nginx 예시 핵심

```nginx
location /socket.io/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 11-3. MongoDB를 외부/사내 DB로 분리할 경우

사내 정책상 DB 서버를 따로 두고 싶다면,
수정해야 하는 것은 거의 **`MONGODB_URI` 하나**다.

예:

```env
MONGODB_URI=mongodb://db.company.local:27017/newkanban
```

Docker Compose에서도 `web.environment.MONGODB_URI`를 바꾸면 된다.

---

## 12. 운영 시 체크리스트

- [ ] 서버 PC의 방화벽에서 `3000` 포트 허용
- [ ] 같은 망 PC에서 `http://<서버PC-IP>:3000` 접속 가능
- [ ] `docker compose ps`에서 `web`, `mongo` 정상
- [ ] `curl http://<서버PC-IP>:3000/api/bootstrap` 응답 확인
- [ ] Socket.IO WebSocket이 proxy에서 막히지 않는지 확인
- [ ] MongoDB 볼륨(`mongo_data`) 백업 정책 마련
- [ ] 업로드 볼륨(`uploads_data`) 백업 정책 마련

---

## 13. 스크립트

```bash
npm run dev        # 개발 서버
npm run build      # production build
npm run start      # production server
npm run lint       # lint
npm run typecheck  # TypeScript 검증
npm run db:reset   # 로컬 DB 초기화
npm run qa:views   # 기본 화면 smoke 검증
npm run qa:lan     # LAN 실시간 협업 검증(데이터 생성됨)
```

---

## 14. 주의 사항

- 이 프로젝트는 현재 **단일 서버 PC + 단일 MongoDB + 여러 LAN 클라이언트** 구조를 기준으로 최적화되어 있다.
- 소규모/중규모 사내 협업에는 적합하다.
- 더 큰 규모에서 다중 앱 서버로 확장하려면:
  - Socket.IO adapter 확장
  - 세션/실시간 라우팅 구조 보강
  - reverse proxy / sticky session 정책 검토
  가 추가로 필요하다.

---

## 15. 요약

이 저장소는 지금 기준으로:

- **Docker Compose로 바로 실행 가능**
- **같은 회사 망의 여러 PC가 같은 데이터 사용 가능**
- **데이터는 서버 PC MongoDB에 저장**
- **workspace별로 task / calendar / my work 분리 저장**
- **실시간 동기화 검증까지 완료**

