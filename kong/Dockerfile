FROM kong/kong:3.9.1

USER root

RUN luarocks install lua-resty-openssl \
 && luarocks install lua-resty-jwt \
 && luarocks install lua-resty-http \
 && luarocks install lua-resty-jwt-validators || true

# Custom plugins land in Kong's standard Lua path so KONG_PLUGINS=<name>
# resolves `kong.plugins.<name>.handler` automatically (no LUA_PACKAGE_PATH override).
COPY plugins/jwt-keycloak-validator/ /usr/local/share/lua/5.1/kong/plugins/jwt-keycloak-validator/

USER kong
