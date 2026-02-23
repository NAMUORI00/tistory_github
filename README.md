# 🧪 Tistory Preview Server

티스토리 스킨 로컬 프리뷰 서버입니다.

## 역할

`server/` 폴더의 코드는 티스토리의 SSR(서버 사이드 렌더링)을 모방하여
스킨 치환자를 실제 블로그 데이터로 채운 결과를 브라우저에서 확인할 수 있습니다.

## 데이터 소스

```
실제 블로그 → /m/api/blog/info   블로그 메타 (제목, 설명, 로고)
           → /rss               글 목록 (최대 50개)
           → HTML 스크래핑        방문자 수, 태그, 카테고리, 최근 댓글
           → <head> 스크래핑      Tistory 공통 CSS/JS
```

## 사용법

이 서버는 모노레포 (`main` 브랜치)에서 서브모듈로 사용됩니다.

```bash
# 모노레포에서 실행
npm run dev
```

## 환경변수

```env
TARGET_BLOG_URL=https://thesauro.tistory.com/
SKIN_DIR=skin    # 스킨 디렉토리 경로 (모노레포 기준)
```
