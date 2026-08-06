# Статический сайт mysun/. Явный Dockerfile — чтобы платформа не пыталась
# сама угадать стек (auto-generate падал: в репо нет package.json/фреймворка).
FROM nginx:1.27-alpine

# слушаем $PORT, если платформа его передаёт; иначе дефолт 8080
ENV PORT=8080

COPY mysun/ /usr/share/nginx/html/
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 8080
