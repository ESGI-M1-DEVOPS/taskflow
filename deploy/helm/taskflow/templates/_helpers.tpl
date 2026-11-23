{{- define "taskflow.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "taskflow.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Values.image.tag | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{/* Sélecteur d'un composant : include "taskflow.selector" (dict "ctx" . "component" "backend") */}}
{{- define "taskflow.selector" -}}
app.kubernetes.io/name: {{ .ctx.Chart.Name }}
app.kubernetes.io/instance: {{ .ctx.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{- define "taskflow.image" -}}
{{- $owner := required "image.owner est obligatoire" .ctx.Values.image.owner -}}
{{- printf "%s/%s/taskflow-%s:%s" .ctx.Values.image.registry $owner .component (.tag | default .ctx.Values.image.tag) -}}
{{- end -}}

{{- define "taskflow.dbSecretName" -}}
{{- .Values.db.existingSecret | default (printf "%s-db" (include "taskflow.fullname" .)) -}}
{{- end -}}
