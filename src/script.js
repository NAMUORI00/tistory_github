/* Tistory Skin - script.js */
document.addEventListener('DOMContentLoaded', () => {
    console.log('Tistory Skin Loaded');

    // 관리자 드롭다운: 외부 클릭 시 닫기
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('adminDropdown');
        if (dropdown && !dropdown.contains(e.target)) {
            dropdown.classList.remove('open');
        }
    });
});
