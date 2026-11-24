output "ip" {
  description = "Adresse IP de la VM de la PR."
  value       = local.ip
}

output "url" {
  description = "URL de l'application sur la VM de la PR."
  value       = "http://${local.ip}:8080"
}

output "vm_name" {
  description = "Nom de la VM dans Proxmox."
  value       = proxmox_virtual_environment_vm.preview.name
}

output "vm_id" {
  description = "ID de la VM dans Proxmox."
  value       = proxmox_virtual_environment_vm.preview.vm_id
}
