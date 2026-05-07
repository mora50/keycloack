FROM quay.io/keycloak/keycloak:26.6.1

COPY realm-export/ /opt/keycloak/data/import/

ENV KC_HEALTH_ENABLED=true \
    KC_METRICS_ENABLED=true

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start-dev", "--import-realm"]
